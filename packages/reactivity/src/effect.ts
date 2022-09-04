import { createDep, Dep } from './dep'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import { isArray } from '@mini-vue3/shared'

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Sets to reduce memory overhead.
type KeyToDepMap = Map<any, Dep>
const targetMap = new WeakMap<any, KeyToDepMap>()

export interface ReactiveEffect<T = any> {
  (): T
  raw: () => T
  deps: Dep[]
  _isEffect: true
  options: ReactiveEffectOptions
}

export let activeEffect: ReactiveEffect | undefined
// stores all effects, which allow nested effects to work
const effectStack: ReactiveEffect[] = []

export const ITERATE_KEY = Symbol('iterate')

export function isEffect(fn: any): fn is ReactiveEffect {
  return !!fn && fn._isEffect
}

export let shouldTrack = true
const trackStack: boolean[] = []

export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

export interface ReactiveEffectOptions {
  lazy?: boolean
  scheduler?: (...args: any[]) => any
  computed?: boolean
}

export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions
): ReactiveEffect<T> {
  if (isEffect(fn)) {
    fn = fn.raw
  }

  const effect = createReactiveEffect(fn, options ?? {})
  if (!options || !options.lazy) {
    effect()
  }
  return effect
}

function createReactiveEffect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions
): ReactiveEffect<T> {
  const effect = function() {
    return run(effect, fn)
  } as ReactiveEffect
  effect._isEffect = true
  effect.raw = fn
  effect.deps = []
  effect.options = options
  return effect
}

function run(effect: ReactiveEffect, fn: () => void): unknown {
  // avoid recursively calling itself
  if (!effectStack.includes(effect)) {
    cleanup(effect)
    try {
      enableTracking()
      effectStack.push(effect)
      activeEffect = effect
      // when executing this.fn()
      // set() && get() handler of Proxy will be triggered
      // and deps will be automatically collected
      return fn()
    } finally {
      effectStack.pop()
      resetTracking()
      activeEffect = effectStack[effectStack.length - 1]
    }
  }
}

function cleanup(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}

export function track(
  target: object,
  type: TrackOpTypes,
  key: unknown
) {
  if (activeEffect && shouldTrack) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = createDep()))
    }

    trackEffects(dep)
  }
}

export function trackEffects(dep: Dep) {
  if (!dep.has(activeEffect!)) {
    dep.add(activeEffect!)
    activeEffect!.deps.push(dep)
  }
}

export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown
) {
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    return
  }

  let deps: (Dep | undefined)[] = []

  // schedule runs for SET | ADD | DELETE
  if (key !== undefined) {
    deps.push(depsMap.get(key))
  }

  // also run for iteration key on ADD | DELETE
  if (type === TriggerOpTypes.ADD || type === TriggerOpTypes.DELETE) {
    deps.push(depsMap.get(ITERATE_KEY))
  }

  const effects: ReactiveEffect[] = []
  for (const dep of deps) {
    if (dep) {
      effects.push(...dep)
    }
  }
  triggerEffects(createDep(effects))
}

export function triggerEffects(dep: Dep | ReactiveEffect[]) {
  // spread into array for stabilization
  const effects = isArray(dep) ? dep : [...dep]
  // Important: computed effects must be run first so that computed getters
  // can be invalidated before any normal effects that depend on them are run.
  effects.forEach(effect => {
    const { computed, scheduler } = effect.options
    if (computed) {
      if (scheduler) {
        scheduler()
      } else {
        effect()
      }
    }
  })
  effects.forEach(effect => {
    const { computed, scheduler } = effect.options
    if (!computed) {
      if (scheduler) {
        scheduler(effect)
      } else {
        effect()
      }
    }
  })
}

import { markRaw } from '@mini-vue3/reactivity'

export const enum TestNodeTypes {
  TEXT = 'text',
  ELEMENT = 'element',
  COMMENT = 'comment'
}

export const enum NodeOpTypes {
  CREATE = 'create',
  INSERT = 'insert',
  REMOVE = 'remove',
  SET_TEXT = 'setText',
  SET_ELEMENT_TEXT = 'setElementText',
  PATCH = 'patch'
}

export interface TestElement {
  id: number
  type: TestNodeTypes.ELEMENT
  parentNode: TestElement | null
  tag: string
  children: TestNode[]
  props: Record<string, any>
  eventListeners: Record<string, Function | Function[]> | null
}

export interface TestText {
  id: number
  type: TestNodeTypes.TEXT
  parentNode: TestElement | null
  text: string
}

export interface TestComment {
  id: number
  type: TestNodeTypes.COMMENT
  parentNode: TestElement | null
  text: string
}

export type TestNode = TestElement | TestText | TestComment

export interface NodeOp {
  type: NodeOpTypes
  nodeType?: TestNodeTypes
  tag?: string
  text?: string
  targetNode?: TestNode
  parentNode?: TestElement
  refNode?: TestNode | null
  propKey?: string
  propPrevValue?: any
  propNextValue?: any
}

let nodeId: number = 0
let recordedNodeOps: NodeOp[] = []

export function logNodeOp(op: NodeOp) {
  recordedNodeOps.push(op)
}

export function resetOps() {
  recordedNodeOps = []
}

export function dumpOps(): NodeOp[] {
  const ops = recordedNodeOps.slice()
  resetOps()
  return ops
}

function createElement(tag: string): TestElement {
  const node: TestElement = {
    id: nodeId++,
    type: TestNodeTypes.ELEMENT,
    tag,
    children: [],
    props: {},
    parentNode: null,
    eventListeners: null
  }
  logNodeOp({
    type: NodeOpTypes.CREATE,
    nodeType: TestNodeTypes.ELEMENT,
    targetNode: node,
    tag
  })
  // avoid test nodes from being observed
  markRaw(node)
  return node
}

function insert(child: TestNode, parent: TestElement, ref?: TestNode | null) {
  let refIndex
  if (ref) {
    refIndex = parent.children.indexOf(ref)
    if (refIndex === -1) {
      console.error('ref: ', ref)
      console.error('parent: ', parent)
      throw new Error('ref is not a child of parent')
    }
  }
  logNodeOp({
    type: NodeOpTypes.INSERT,
    targetNode: child,
    parentNode: parent,
    refNode: ref
  })
  // remove the node first, but don't log it as a REMOVE op
  remove(child, false)
  // re-calculate the ref index because the child's removal may have affected it
  refIndex = ref ? parent.children.indexOf(ref) : -1
  if (refIndex === -1) {
    parent.children.push(child)
    child.parentNode = parent
  } else {
    parent.children.splice(refIndex, 0, child)
    child.parentNode = parent
  }
}

function remove(child: TestNode, logOp = true) {
  const parent = child.parentNode
  if (parent) {
    if (logOp) {
      logNodeOp({
        type: NodeOpTypes.REMOVE,
        targetNode: child,
        parentNode: parent
      })
    }
    const i = parent.children.indexOf(child)
    if (i > -1) {
      parent.children.splice(i, 1)
    } else {
      console.error('target: ', child)
      console.error('parent: ', parent)
      throw Error('target is not a childNode of parent')
    }
    child.parentNode = null
  }
}

export const nodeOps = {
  insert,
  remove,
  createElement
}

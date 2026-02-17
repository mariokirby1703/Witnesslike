export type Point = { x: number; y: number }

export const NODE_COUNT = 5
export const MAX_INDEX = NODE_COUNT - 1
export const START: Point = { x: 0, y: MAX_INDEX }
export const END: Point = { x: MAX_INDEX, y: 0 }
export const VIEWBOX = { x: -0.6, y: -0.6, w: 5.2, h: 5.2 }
export const END_CAP_LENGTH = 0.28
export const GAP_SIZE = 0.36

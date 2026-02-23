export const DEFAULT_PUZZLE_CELL_COUNT = 4;
const MIN_PUZZLE_CELL_COUNT = 1;
const MAX_PUZZLE_CELL_COUNT = 4;
const VIEWBOX_MARGIN = 0.6;
export let NODE_COUNT = DEFAULT_PUZZLE_CELL_COUNT + 1;
export let MAX_INDEX = NODE_COUNT - 1;
export let START = { x: 0, y: MAX_INDEX };
export let END = { x: MAX_INDEX, y: 0 };
export let VIEWBOX = {
    x: -VIEWBOX_MARGIN,
    y: -VIEWBOX_MARGIN,
    w: MAX_INDEX + VIEWBOX_MARGIN * 2,
    h: MAX_INDEX + VIEWBOX_MARGIN * 2,
};
export const END_CAP_LENGTH = 0.28;
export const GAP_SIZE = 0.36;
function clampPuzzleCellCount(cellCount) {
    return Math.max(MIN_PUZZLE_CELL_COUNT, Math.min(MAX_PUZZLE_CELL_COUNT, Math.floor(cellCount)));
}
export function getPuzzleCellCount() {
    return NODE_COUNT - 1;
}
export function setPuzzleCellCount(cellCount) {
    const clamped = clampPuzzleCellCount(cellCount);
    const nextNodeCount = clamped + 1;
    NODE_COUNT = nextNodeCount;
    MAX_INDEX = nextNodeCount - 1;
    START = { x: 0, y: MAX_INDEX };
    END = { x: MAX_INDEX, y: 0 };
    VIEWBOX = {
        x: -VIEWBOX_MARGIN,
        y: -VIEWBOX_MARGIN,
        w: MAX_INDEX + VIEWBOX_MARGIN * 2,
        h: MAX_INDEX + VIEWBOX_MARGIN * 2,
    };
}

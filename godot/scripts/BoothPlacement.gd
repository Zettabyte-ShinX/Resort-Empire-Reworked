extends RefCounted

## Grid footprint and validity rules for placing booths.
##
## Pure logic: this script never touches the scene tree, the atlas or the
## camera, so placement rules can be tested (and later extended with path
## adjacency) without rendering anything.

## Footprint of a booth anchored at `anchor`.
##
## Mirrors Booth.as, where the object is positioned at the anchor tile and
## covers ROWS cells toward -x and COLS cells toward +y from it. The anchor is
## therefore the back corner of the footprint, not its centre.
static func cells_for(anchor: Vector2i, rows: int, cols: int) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	for i in rows:
		for j in cols:
			cells.append(Vector2i(anchor.x - i, anchor.y + j))
	return cells


var grid_size: int = 37
var rows: int = 1
var cols: int = 1
## Number of booths placed so far.
var count: int = 0

var _occupied: Dictionary = {}


func configure(p_grid_size: int, p_rows: int, p_cols: int) -> void:
	grid_size = p_grid_size
	rows = maxi(1, p_rows)
	cols = maxi(1, p_cols)
	count = 0
	_occupied.clear()


func cells_at(anchor: Vector2i) -> Array[Vector2i]:
	return cells_for(anchor, rows, cols)


func is_in_bounds(cell: Vector2i) -> bool:
	return (
		cell.x >= 0 and cell.y >= 0
		and cell.x < grid_size and cell.y < grid_size
	)


func is_free(cell: Vector2i) -> bool:
	return not _occupied.has(cell)


## Empty string when the booth fits, otherwise why it does not.
func why_not(anchor: Vector2i) -> String:
	var overlaps := false
	for cell in cells_at(anchor):
		if not is_in_bounds(cell):
			return "out of bounds"
		if not is_free(cell):
			overlaps = true
	return "overlaps" if overlaps else ""


func can_place(anchor: Vector2i) -> bool:
	return why_not(anchor) == ""


## Reserve the footprint. Returns false when the anchor is not valid, in which
## case nothing is changed.
func place(anchor: Vector2i) -> bool:
	if not can_place(anchor):
		return false
	for cell in cells_at(anchor):
		_occupied[cell] = true
	count += 1
	return true


## Paint depth for a footprint: booths with a larger value draw later (front).
static func depth_of(cells: Array[Vector2i]) -> int:
	var best := -1
	for cell in cells:
		best = maxi(best, cell.x + cell.y)
	return best

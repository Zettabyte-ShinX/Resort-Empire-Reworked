extends Node2D

## Draws booths on the map: the ghost preview under the pointer and every
## placed booth, back to front.
##
## This layer owns no rules. It is handed a footprint (from BoothPlacement)
## and draws it; the ghost turns green when the caller says the footprint is
## valid and red otherwise.

const Iso = preload("res://scripts/Iso.gd")
const Atlas = preload("res://scripts/Atlas.gd")
const BoothPlacement = preload("res://scripts/BoothPlacement.gd")

const VALID_FILL := Color(0.35, 1.0, 0.45, 0.28)
const VALID_EDGE := Color(0.10, 0.85, 0.25, 0.95)
const INVALID_FILL := Color(1.0, 0.32, 0.28, 0.28)
const INVALID_EDGE := Color(0.95, 0.12, 0.10, 0.95)
const GHOST_TINT := Color(1.0, 1.0, 1.0, 0.65)
const GHOST_TINT_INVALID := Color(1.0, 0.55, 0.55, 0.65)

## Placed booths sit at depth 0..72 (x + y of a 37 x 37 map); the ghost is
## drawn above all of them.
const GHOST_Z := 100

var atlas: Atlas
## Frames used for the ghost and for newly placed booths.
## Body is the floor slab, wall is the building on top of it.
var body_frame := ""
var wall_frame := ""

## Centre of the floor slab art, relative to the symbol origin. The wall is
## shifted by the same amount so the building stays composed on the slab.
var _art_anchor := Vector2.ZERO

var _ghost_anchor := Vector2i(-1, -1)
var _ghost_cells: Array[Vector2i] = []
var _ghost_valid := false
var _has_ghost := false


func _ready() -> void:
	z_index = GHOST_Z
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST


func configure(p_atlas: Atlas, p_body_frame: String, p_wall_frame: String = "") -> void:
	atlas = p_atlas
	body_frame = p_body_frame
	wall_frame = p_wall_frame
	_art_anchor = Vector2.ZERO
	if atlas != null and body_frame != "" and atlas.has_frame(body_frame):
		_art_anchor = atlas.art_centre(body_frame)
	queue_redraw()


## Show the preview for a footprint. `valid` only selects the colour; the
## footprint itself comes from BoothPlacement.cells_at().
func set_ghost(anchor: Vector2i, cells: Array[Vector2i], valid: bool) -> void:
	if _has_ghost and anchor == _ghost_anchor and cells == _ghost_cells and valid == _ghost_valid:
		return
	_ghost_anchor = anchor
	_ghost_cells = cells
	_ghost_valid = valid
	_has_ghost = true
	queue_redraw()


func clear_ghost() -> void:
	if not _has_ghost:
		return
	_has_ghost = false
	queue_redraw()


## Add a permanent booth. Depth comes from the footprint, so the caller never
## has to sort anything: larger x + y draws in front.
func place_booth(cells: Array[Vector2i], body: String, wall: String = "") -> void:
	if atlas == null or cells.is_empty():
		return
	var centre := footprint_centre(cells)
	var depth := BoothPlacement.depth_of(cells)
	var index := get_child_count()
	# Floor first, building second: equal depth, tree order breaks the tie.
	_add_sprite(body, centre, depth, "Booth%dBody" % index)
	_add_sprite(wall, centre, depth, "Booth%dWall" % index)


func _add_sprite(frame_id: String, centre: Vector2, depth: int, name: String) -> void:
	if frame_id == "" or not atlas.has_frame(frame_id):
		return
	var texture := atlas.texture(frame_id)
	if texture == null:
		return
	var sprite := Sprite2D.new()
	sprite.name = name
	sprite.texture = texture
	sprite.centered = false
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.position = centre - _art_anchor + atlas.art_rect(frame_id).position
	sprite.z_as_relative = false
	sprite.z_index = depth
	add_child(sprite)


## Centre of the footprint's screen-space bounding box. The booth art covers
## a little more than its cells (the Lobby slab includes its entrance step),
## so it is centred here rather than pinned to one corner.
static func footprint_centre(cells: Array[Vector2i]) -> Vector2:
	if cells.is_empty():
		return Vector2.ZERO
	var low := Vector2(INF, INF)
	var high := Vector2(-INF, -INF)
	for cell in cells:
		var centre := Iso.tile_to_world(cell)
		low = low.min(centre - Vector2(Iso.TILE_HALF_WIDTH, Iso.TILE_HALF_HEIGHT))
		high = high.max(centre + Vector2(Iso.TILE_HALF_WIDTH, Iso.TILE_HALF_HEIGHT))
	return (low + high) * 0.5


func _draw() -> void:
	if not _has_ghost:
		return

	var fill := VALID_FILL if _ghost_valid else INVALID_FILL
	var edge := VALID_EDGE if _ghost_valid else INVALID_EDGE
	for cell in _ghost_cells:
		draw_colored_polygon(Iso.tile_diamond(cell), fill)

	var centre := footprint_centre(_ghost_cells)
	var tint := GHOST_TINT if _ghost_valid else GHOST_TINT_INVALID
	_draw_art(body_frame, centre, tint)
	_draw_art(wall_frame, centre, tint)

	for cell in _ghost_cells:
		var diamond := Iso.tile_diamond(cell)
		diamond.append(diamond[0])
		draw_polyline(diamond, edge, 1.5, true)


func _draw_art(frame_id: String, centre: Vector2, tint: Color) -> void:
	if atlas == null or frame_id == "" or not atlas.has_frame(frame_id):
		return
	var frame := atlas.frame(frame_id)
	var art := atlas.art_rect(frame_id)
	var page := atlas.page_texture(frame.get("atlas", ""))
	if page == null:
		return
	draw_texture_rect_region(
		page,
		Rect2(centre - _art_anchor + art.position, art.size),
		atlas.region_rect(frame_id),
		tint
	)

extends Sprite2D

## Renders the 37 x 37 ground from the atlas.
##
## Every tile is blitted into one image at its projected cell centre, using
## the manifest's `offset + crop` so the trimmed art lands exactly where the
## original untrimmed bitmap would have. The result is a single texture: the
## grid never needs 1,369 nodes.
##
## Tiles are laid back to front (x + y ascending) so the 1 px cell margins
## overlap the way the original 50 x 26 bitmaps do.

const Iso = preload("res://scripts/Iso.gd")
const Atlas = preload("res://scripts/Atlas.gd")

@export_range(1, 60) var grid_size: int = Iso.GRID_SIZE
## Tile used for cells that are not listed in `tiles`.
@export var default_tile := "TILE_5"

var atlas: Atlas
## Tile id ("TILE_5") -> frame id ("TileClip::14").
var tile_frames: Dictionary = {}
## Cell -> tile id. Empty cells fall back to `default_tile`.
var tiles: Dictionary = {}


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST


func configure(p_atlas: Atlas, p_tile_frames: Dictionary) -> void:
	atlas = p_atlas
	tile_frames = p_tile_frames
	build()


func build() -> void:
	texture = null
	if atlas == null or atlas.pages.is_empty() or grid_size <= 0:
		return

	var bounds := Iso.grid_world_bounds(grid_size)
	var size := Vector2i(ceili(bounds.size.x), ceili(bounds.size.y))
	if size.x <= 0 or size.y <= 0:
		return

	var canvas := Image.create(size.x, size.y, false, Image.FORMAT_RGBA8)
	canvas.fill(Color(0, 0, 0, 0))

	var missing := 0
	for diagonal in range(2 * grid_size - 1):
		var first_x := maxi(0, diagonal - grid_size + 1)
		var last_x := mini(diagonal, grid_size - 1)
		for x in range(first_x, last_x + 1):
			var cell := Vector2i(x, diagonal - x)
			var tile_id: String = tiles.get(cell, default_tile)
			var frame_id: String = tile_frames.get(tile_id, "")
			if frame_id == "" or not atlas.has_frame(frame_id):
				missing += 1
				continue
			var frame := atlas.frame(frame_id)
			var region = frame.get("region", [0, 0, 0, 0])
			var art := atlas.art_rect(frame_id)
			var page := atlas.page_image(frame.get("atlas", ""))
			if page == null:
				missing += 1
				continue
			var dest := Iso.tile_to_world(cell) + art.position - bounds.position
			canvas.blend_rect(
				page,
				Rect2i(region[0], region[1], region[2], region[3]),
				Vector2i(roundi(dest.x), roundi(dest.y))
			)

	if missing > 0:
		push_warning("%d tile(s) had no atlas frame (tile %s)." % [missing, default_tile])

	texture = ImageTexture.create_from_image(canvas)
	centered = false
	position = bounds.position

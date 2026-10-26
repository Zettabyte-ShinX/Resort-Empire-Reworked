extends Node2D

const Iso = preload("res://scripts/Iso.gd")
const Atlas = preload("res://scripts/Atlas.gd")

var simulation
var atlas: Atlas

var _views: Dictionary = {}

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST

func update_from_sim() -> void:
	if simulation == null or atlas == null:
		return
	# remove finished
	var to_remove: Array = []
	for id in _views.keys():
		var found := false
		for v in simulation.visitors:
			if v.id == id:
				found = true
				break
		if not found:
			to_remove.append(id)
	for id in to_remove:
		var node = _views[id]
		if is_instance_valid(node):
			node.queue_free()
		_views.erase(id)

	for v in simulation.visitors:
		if not _views.has(v.id):
			var sprite := Sprite2D.new()
			sprite.centered = false
			sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			add_child(sprite)
			_views[v.id] = sprite
		var sprite: Sprite2D = _views[v.id]
		var clip_name := "Visitor1.walk_back" if v.facing_back else "Visitor1.walk_front"
		var frames: Array = []
		if atlas.clips.has(clip_name):
			frames = atlas.clips[clip_name].get("frames", [])
		var frame_id := ""
		if not frames.is_empty():
			var idx := int(simulation.counter) % frames.size()
			frame_id = str(frames[idx])
		if frame_id != "" and atlas.has_frame(frame_id):
			sprite.texture = atlas.texture(frame_id)
			var art := atlas.art_rect(frame_id)
			sprite.position = v.pos + art.position
			sprite.scale = Vector2(1.0 if v.facing_right else -1.0, 1.0)

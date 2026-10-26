extends RefCounted

## Money: the economy ledger, kept out of the simulation and the renderer.
##
## Two ledgers, matching the original:
##   - resort cash: starts at $10,000 (notes §1); a booth payment is credited
##     here when a visitor leaves the booth (Booth.out -> insertMoneyClip).
##   - visitor wallets: each spawned visitor draws cash once (Visitor.creating
##     -> updateMoney), and pays booth fees + tips from it.
##
## Tips use the original's quirk (notes §6.4 / §14.1): the base tip value is
## only a cap for upgrade bonuses, never paid on its own. With no upgrades
## owned, tip is always 0 - preserved here on purpose.

## Starting resort cash (notes §1).
const START_RESORT_CASH := 10000

## Visitor spawn cash at popularity <= 5 (Visitor.creating):
## _loc13_ = 225, _loc14_ = 1250 -> randomRange(225, 1250).
const VISITOR_CASH_MIN := 225
const VISITOR_CASH_MAX := 1250

var resort: float = START_RESORT_CASH
## visitor id -> remaining cash.
var wallets: Dictionary = {}


## Cash a newly spawned visitor carries (original: randomRange(225, 1250)).
static func roll_visitor_cash(rng: RandomNumberGenerator) -> int:
	return rng.randi_range(VISITOR_CASH_MIN, VISITOR_CASH_MAX)


func open_wallet(id: int, cash: int) -> void:
	wallets[id] = cash


func close_wallet(id: int) -> void:
	wallets.erase(id)


func cash_of(id: int) -> int:
	return int(wallets.get(id, 0))


func can_afford(id: int, amount: float) -> bool:
	return cash_of(id) >= int(amount)


## Pay `fee + tip` from the visitor to the resort.
## Returns false (and changes nothing) when the wallet cannot cover it.
func pay(id: int, fee: float, tip: float = 0.0) -> bool:
	var total := fee + tip
	if not can_afford(id, total):
		return false
	wallets[id] = cash_of(id) - int(total)
	resort += total
	return true

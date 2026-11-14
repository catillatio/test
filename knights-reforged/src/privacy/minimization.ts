// An inert FK anchor is not a retained playable profile or a replacement NPC.
// Epoch is a documented erased-value sentinel, never a claimed historical date.
export const erasedProfile=Object.freeze({account_id:null,name:'Deleted Warrior',xp:0,health:0,energy:0,
 health_updated_at:'1970-01-01T00:00:00.000Z',energy_updated_at:'1970-01-01T00:00:00.000Z',attack_ready_at:'1970-01-01T00:00:00.000Z',state_version:1,
 created_at:'1970-01-01T00:00:00.000Z',max_health:100,mana:0,max_mana:20,spirit:0,max_spirit:3,
 mana_updated_at:'1970-01-01T00:00:00.000Z',spirit_updated_at:'1970-01-01T00:00:00.000Z',attained_level:1,level_xp:0,skill_points:0,
 legacy_army_floor:1,profile_class:'Freeblade',attack_training:0,defense_training:0,calling_changed_at:null});
// Financially referenced lots remain as historical FK anchors, never a live
// loadout/estate. Their original purchase/settlement facts are not rewritten.
export const erasedInventory=Object.freeze({quantity:0});
export const erasedLot=Object.freeze({remaining_quantity:0});
export const erasedHolding=Object.freeze({quantity:0});
// Reserve, arrears and fractional amounts stay exact; the defunct profile's
// active upkeep rate/activity clock are unnecessary personal state.
export const erasedMaintenance=Object.freeze({hourly_rate:0,paused:true,settled_at:'1970-01-01T00:00:00.000Z'});

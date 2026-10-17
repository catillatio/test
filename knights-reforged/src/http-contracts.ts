// Shared by the HTTP controllers and the dependency-free project inspection.
// These are replacement routes; they do not address the historical server.
export const navigation = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'quests', label: 'Quests', icon: 'quests' },
  { id: 'battle', label: 'Battle', icon: 'battle' },
  { id: 'armory', label: 'Armory', icon: 'armory' },
  { id: 'army', label: 'Army', icon: 'army' },
] as const;

export const templateScreens = ['home', 'quests', 'battle', 'armory', 'army', 'auth', 'report', 'rules', 'error'] as const;

export const commandRoutes = [
  { kind: 'quest', html: '/game/quests/:id/run', api: '/api/v1/quests/:id/runs' },
  { kind: 'recruit', html: '/game/army/recruit', api: '/api/v1/army/recruitments' },
  { kind: 'buy', html: '/game/armory/buy', api: '/api/v1/inventory/purchases' },
  { kind: 'equip', html: '/game/armory/equip', api: '/api/v1/equipment' },
  { kind: 'attack', html: '/game/battle/attack', api: '/api/v1/battles' },
] as const;

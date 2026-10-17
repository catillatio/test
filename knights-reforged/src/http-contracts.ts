// Shared by the HTTP controllers and the dependency-free project inspection.
// These are replacement routes; they do not address the historical server.
// Keep every implemented screen here. The shared view puts Land in secondary
// navigation without removing its HTTP routes.
export const navigation = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'quests', label: 'Quests', icon: 'quests' },
  { id: 'battle', label: 'Battle', icon: 'battle' },
  { id: 'armory', label: 'Armory', icon: 'armory' },
  { id: 'army', label: 'Recruit', icon: 'army' },
  { id: 'land', label: 'Land', icon: 'land' },
] as const;

export const templateScreens = ['home', 'quests', 'battle', 'armory', 'army', 'land', 'profile', 'auth', 'report', 'rules', 'error'] as const;

export const commandRoutes = [
  { kind: 'quest', html: '/game/quests/:id/run', api: '/api/v1/quests/:id/runs' },
  { kind: 'recruit', html: '/game/army/recruit', api: '/api/v1/army/recruitments' },
  { kind: 'buy', html: '/game/armory/buy', api: '/api/v1/inventory/purchases' },
  { kind: 'equip', html: '/game/armory/equip', api: '/api/v1/equipment' },
  { kind: 'attack', html: '/game/battle/attack', api: '/api/v1/battles' },
  { kind: 'land_buy', html: '/game/land/buy', api: '/api/v1/land/purchases' },
  { kind: 'sell', html: '/game/armory/sell', api: '/api/v1/inventory/sales' },
  { kind: 'land_sell', html: '/game/land/sell', api: '/api/v1/land/sales' },
  { kind: 'skill', html: '/game/profile/skills', api: '/api/v1/skills' },
  { kind: 'profile', html: '/game/profile/calling', api: '/api/v1/profile' },
  { kind: 'maintain', html: '/game/armory/maintain', api: '/api/v1/maintenance' },
  { kind: 'quest_buy', html: '/game/quests/:id/equipment', api: '/api/v1/quests/:id/equipment' },
  { kind: 'invite', html: '/game/army/invite', api: '/api/v1/army/invitations' },
  { kind: 'accept', html: '/game/army/accept', api: '/api/v1/army/acceptances' },
  { kind: 'remove', html: '/game/army/remove', api: '/api/v1/army/removals' },
] as const;

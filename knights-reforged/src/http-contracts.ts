// Shared by the HTTP controllers and the dependency-free project inspection.
// These are replacement routes; they do not address the historical server.
// Keep every implemented screen here. Land is linked only from Home; its HTTP
// routes remain directly accessible and are not part of the five-tab bar.
export const navigation = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'quests', label: 'Quests', icon: 'quests' },
  { id: 'battle', label: 'Battle', icon: 'battle' },
  { id: 'armory', label: 'Armory', icon: 'armory' },
  { id: 'army', label: 'Recruit', icon: 'army' },
  { id: 'land', label: 'Land', icon: 'land' },
] as const;

export const templateScreens = ['purchase', 'home', 'quests', 'battle', 'bounties', 'bounty-confirm', 'bounty-new', 'vault', 'armory', 'army', 'land', 'profile', 'settings', 'auth', 'report', 'rules', 'error'] as const;

export const commandRoutes = [
  {kind:'vault_deposit',html:'/game/vault/deposit',api:'/api/v1/vault/deposits'},
  {kind:'vault_withdraw',html:'/game/vault/withdraw',api:'/api/v1/vault/withdrawals'},
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
  { kind: 'bounty_place', html: '/game/bounties/place', api: '/api/v1/bounties/placements' },
  { kind: 'bounty_cancel', html: '/game/bounties/cancel', api: '/api/v1/bounties/cancellations' },
  { kind: 'maintain', html: '/game/armory/maintain', api: '/api/v1/maintenance' },
  { kind: 'quest_buy', html: '/game/quests/:id/equipment', api: '/api/v1/quests/:id/equipment' },
  { kind:'invite_code',html:'/game/army/invite-code',api:'/api/v1/army/code-invitations' },
  { kind:'reject',html:'/game/army/reject',api:'/api/v1/army/rejections' },
  { kind:'comment',html:'/game/social/comment',api:'/api/v1/comments' },
  { kind:'broadcast',html:'/game/social/broadcast',api:'/api/v1/broadcasts' },
  { kind:'social_report',html:'/game/social/report',api:'/api/v1/social/reports' },
  { kind:'social_remove',html:'/game/social/remove',api:'/api/v1/social/removals' },
  { kind: 'invite', html: '/game/army/invite', api: '/api/v1/army/invitations' },
  { kind: 'accept', html: '/game/army/accept', api: '/api/v1/army/acceptances' },
  { kind: 'remove', html: '/game/army/remove', api: '/api/v1/army/removals' },
] as const;

import {readFileSync} from 'node:fs';
export const community=JSON.parse(readFileSync(new URL('../rulesets/community-0.1/rules.json',import.meta.url),'utf8')) as {
  id:string;provenance:string;combat:{defenderMinimumHealth:number};
  social:{commentCharacters:number;broadcastCharacters:number;commentCooldownSeconds:number;broadcastCooldownSeconds:number;commentsPerDay:number;broadcastsPerDay:number;reportsPerDay:number;broadcastMinimumLevel:number;broadcastMinimumQuests:number;pageSize:number};
  army:{codeCharacters:number;invitationCooldownSeconds:number;invitationsPerDay:number;reinviteCooldownSeconds:number};
};
if(community.id!=='community-0.1'||community.combat.defenderMinimumHealth!==1)throw new Error('Invalid community ruleset.');

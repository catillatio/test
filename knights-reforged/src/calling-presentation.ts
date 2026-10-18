// Database keys and recorded combat snapshots stay Freeblade/Warden/Spellward.
const identities:Record<string,{name:string;description:string}>={
 Freeblade:{name:'Barbarian',description:'An aggressive fighter: +4% attack, −2% defense, and 10% shorter Spirit recovery intervals.'},
 Warden:{name:'Tank',description:'A steadfast defender: +4% defense, −2% attack, and 10% shorter Health recovery intervals.'},
 Spellward:{name:'Mage',description:'An arcane quest specialist: 10% shorter Mana recovery intervals, with −2% attack and defense. Spell equipment uses its normal power.'},
};
export const callingName=(key:string)=>identities[key]?.name??key;
export const callingDescription=(key:string)=>identities[key]?.description??'Your saved Calling is preserved.';

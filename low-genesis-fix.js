// Raptor Mod 0.17.2: manually spawned God Mode lows get a short genesis-assist flag.
// Natural tropical waves never receive this flag, so seasonal climatology is unchanged.
(function(){
    const ASSIST_HOURS = 36;
    const ATTR = 'manualGenesisAssistHours';

    // Persist the short assist timer in current saves. Most modes use the default
    // active-attribute list; Experimental owns a custom list, so add it anywhere
    // an explicit list exists to keep the behavior future-proof.
    const ensureAttr = arr=>{
        if(arr instanceof Array && !arr.includes(ATTR)) arr.push(ATTR);
    };
    for(const key in ACTIVE_ATTRIBS) ensureAttr(ACTIVE_ATTRIBS[key]);

    const tuneLow = function(archetype){
        if(!archetype) return;
        archetype.pressure = 1012;
        archetype.windSpeed = 20;
        archetype.organization = 0.35;
        archetype[ATTR] = ASSIST_HOURS;
    };

    tuneLow(SPAWN_RULES.defaults && SPAWN_RULES.defaults.archetypes && SPAWN_RULES.defaults.archetypes.l);

    // Tune any mode-specific Low archetypes too. Experimental currently owns one
    // and keeps all of its additional fields (including kaboom) untouched.
    for(const key in SPAWN_RULES){
        const rules = SPAWN_RULES[key];
        if(rules && rules.archetypes && rules.archetypes.l)
            tuneLow(rules.archetypes.l);
    }

    window.__raptorManualLowGenesisAssistHours = ASSIST_HOURS;
})();

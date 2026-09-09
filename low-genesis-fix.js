// Raptor Mod 0.17.1: make manually spawned God Mode lows respond faster.
// Natural tropical-wave spawning and the global cyclone algorithm are unchanged.
(function(){
    const tuneLow = function(archetype){
        if(!archetype) return;
        archetype.pressure = 1012;
        archetype.windSpeed = 20;
        archetype.organization = 0.35;
    };

    tuneLow(SPAWN_RULES.defaults && SPAWN_RULES.defaults.archetypes && SPAWN_RULES.defaults.archetypes.l);

    // Experimental mode owns its own copy of the Low archetype, so keep its
    // God Mode spawn behavior consistent while leaving its extra kaboom state intact.
    if(SPAWN_RULES[SIM_MODE_EXPERIMENTAL] && SPAWN_RULES[SIM_MODE_EXPERIMENTAL].archetypes)
        tuneLow(SPAWN_RULES[SIM_MODE_EXPERIMENTAL].archetypes.l);
})();

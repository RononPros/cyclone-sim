// Calm simulation mode: fewer disturbances and a slightly more hostile
// tropical environment, while keeping Normal-mode storm physics and tuning.

const SIM_MODE_CALM = SIMULATION_MODES.length;
SIMULATION_MODES.push('Calm');

(function(){
    const cloneModeEntry = function(entry){
        const copy = {};
        if(!entry) return copy;
        for(const key in entry){
            const value = entry[key];
            if(key === 'modifiers' && value)
                copy[key] = Object.assign({}, value);
            else if(value instanceof Array)
                copy[key] = value.slice();
            else
                copy[key] = value;
        }
        return copy;
    };

    // --- Spawn climatology ----------------------------------------------------
    // Roughly halve the tropical-wave supply compared with Normal, while also
    // trimming extratropical seed systems. Seasonality is preserved.
    SPAWN_RULES[SIM_MODE_CALM] = {};
    SPAWN_RULES[SIM_MODE_CALM].doSpawn = function(b){
        if(random() < 0.0075*sq((seasonCurve(b.tick)+1)/2))
            b.spawnArchetype('tw');

        if(random() < 0.007-0.0015*seasonCurve(b.tick))
            b.spawnArchetype('ex');
    };

    // --- Environment ----------------------------------------------------------
    // Start from the fully tuned Normal-mode field registrations so Calm keeps
    // later steering/SST fixes, then apply only the climatological nerfs below.
    ENV_DEFS[SIM_MODE_CALM] = {};
    for(const field in ENV_DEFS[SIM_MODE_NORMAL])
        ENV_DEFS[SIM_MODE_CALM][field] = cloneModeEntry(ENV_DEFS[SIM_MODE_NORMAL][field]);

    // About 1 C cooler in the tropics than Normal through the year, with a
    // slightly cooler polar profile as well.
    ENV_DEFS[SIM_MODE_CALM].SST = cloneModeEntry(ENV_DEFS[SIM_MODE_CALM].SST);
    ENV_DEFS[SIM_MODE_CALM].SST.modifiers = Object.assign(
        {},
        ENV_DEFS[SIM_MODE_CALM].SST.modifiers || {},
        {
            offSeasonPolarTemp: -4,
            peakSeasonPolarTemp: 8,
            offSeasonTropicsTemp: 25,
            peakSeasonTropicsTemp: 28
        }
    );

    // Drier background air makes marginal systems struggle without making the
    // basin sterile. Strong storms can still happen when local conditions line up.
    ENV_DEFS[SIM_MODE_CALM].moisture = cloneModeEntry(ENV_DEFS[SIM_MODE_CALM].moisture);
    ENV_DEFS[SIM_MODE_CALM].moisture.modifiers = Object.assign(
        {},
        ENV_DEFS[SIM_MODE_CALM].moisture.modifiers || {},
        {
            polarMoisture: 0.40,
            tropicalMoisture: 0.52,
            mountainMoisture: 0.18
        }
    );

    // Give storms a modest effective-shear penalty without changing their tracks.
    // The stock shear vector is still used; Calm simply raises its magnitude 10%.
    ENV_DEFS[SIM_MODE_CALM].shear = cloneModeEntry(ENV_DEFS[SIM_MODE_CALM].shear);
    const normalShearMap = ENV_DEFS.defaults.shear.mapFunc;
    ENV_DEFS[SIM_MODE_CALM].shear.mapFunc = function(u,x,y,z){
        const shear = normalShearMap(u,x,y,z);
        shear.mult(1.10);
        return shear;
    };

    // --- Storm physics --------------------------------------------------------
    // Clone the tuned Normal-mode algorithm hooks (including lifecycle/recovery)
    // instead of duplicating the full cyclone core.
    STORM_ALGORITHM[SIM_MODE_CALM] = {};
    for(const key in STORM_ALGORITHM[SIM_MODE_NORMAL])
        STORM_ALGORITHM[SIM_MODE_CALM][key] = STORM_ALGORITHM[SIM_MODE_NORMAL][key];
})();

// Raptor Mod 0.17.2: short, environment-gated genesis assist for manually spawned Lows.
// Runs after the Normal-mode intensification governor so the assist can correct the
// stock weak-low pressure-rise bias without changing natural tropical-wave physics.
(function(){
    const ATTR = 'manualGenesisAssistHours';

    const applyAssist = function(sys,u,pressureBefore){
        let remaining = Number(sys[ATTR]) || 0;
        if(remaining <= 0) return;

        // Once the system is no longer a tropical wave/remnant, the special path
        // is finished permanently. Type determination runs immediately after core.
        if(sys.type !== TROPWAVE){
            sys[ATTR] = 0;
            return;
        }

        // The timer advances every simulated hour even in hostile conditions, so
        // a badly placed Low cannot carry the boost halfway across an ocean.
        sys[ATTR] = max(0,remaining-1);

        const lnd = u.land();
        const SST = u.f('SST');
        const moisture = u.f('moisture');
        const shear = u.f('shear').mag() + sys.interaction.shear;
        const warmStructure = sys.lowerWarmCore >= 0.65 && sys.upperWarmCore >= 0.55;

        // No free development over land, cool water, dry air, or strong shear.
        const decent = !lnd && warmStructure &&
            SST >= 26.5 && moisture >= 0.45 && shear <= 4.5;
        if(!decent) return;

        // Continuous favorability score. This controls how aggressively the
        // temporary assist acts while preserving a large difference between
        // marginal and genuinely favorable genesis environments.
        const sstFactor = map(SST,26.5,29.5,0,1,true);
        const moistureFactor = map(moisture,0.45,0.70,0,1,true);
        const shearFactor = map(shear,4.5,1.0,0,1,true);
        const favorability = constrain(
            0.40*sstFactor + 0.35*moistureFactor + 0.25*shearFactor,
            0,1
        );

        // Help the circulation consolidate toward the existing TD threshold.
        // This is deliberately capped below a mature cyclone organization state.
        const organizationTarget = 0.48 + 0.08*favorability;
        const organizationRate = 0.08 + 0.08*favorability;
        if(sys.organization < organizationTarget)
            sys.organization = lerp(sys.organization,organizationTarget,organizationRate);

        // The stock weak-wave noise can otherwise push a fresh 1012 hPa Low toward
        // 1020 hPa even in decent conditions. Limit that net rise, with essentially
        // no upward drift allowed in the best genesis environments.
        const maxPressureRise = lerp(0.35,0,favorability);
        if(sys.pressure > pressureBefore + maxPressureRise)
            sys.pressure = pressureBefore + maxPressureRise;

        // Give the developing Low a modest pre-TD pressure target. This avoids the
        // stock organization^3 bottleneck without handing it hurricane-level
        // pressure potential. The target bottoms out near 1002 hPa while assisted.
        const organizationProgress = map(sys.organization,0.30,0.55,0,1,true);
        let genesisTarget = lerp(1011,1004,organizationProgress) - 1.5*favorability;
        genesisTarget = max(genesisTarget,1002);

        if(genesisTarget < sys.pressure){
            const pressureRate = 0.08 + 0.08*favorability;
            const hourlyPressureCap = 0.55 + 0.45*favorability;
            const drop = min((sys.pressure-genesisTarget)*pressureRate,hourlyPressureCap);
            sys.pressure -= drop;
        }

        // Keep winds coupled to the assisted pressure response, but cap the
        // pre-genesis target so this cannot spawn a disguised tropical storm.
        let targetWind = map(sys.pressure,1030,900,1,160) *
            map(sys.lowerWarmCore,1,0,1,0.6);
        targetWind = min(targetWind,32);
        if(targetWind > sys.windSpeed){
            const windRate = 0.12 + 0.08*favorability;
            sys.windSpeed = lerp(sys.windSpeed,targetWind,windRate);
        }

        // As soon as it has crossed the existing tropical-development gates, end
        // the assist. The normal type-determination code will classify it next.
        if(sys.organization >= 0.45 && sys.windSpeed >= 25 &&
           sys.lowerWarmCore >= 0.55 && sys.upperWarmCore >= 0.56)
            sys[ATTR] = 0;
    };

    const wrapMode = function(mode){
        if(!STORM_ALGORITHM[mode]) return;
        const previousCore = STORM_ALGORITHM[mode].core || STORM_ALGORITHM.defaults.core;
        STORM_ALGORITHM[mode].core = function(sys,u){
            const pressureBefore = sys.pressure;
            previousCore(sys,u);
            if(sys.kill) return;
            applyAssist(sys,u,pressureBefore);
        };
    };

    // Manual Low spawning exists in every simulation mode. Because only the L
    // archetype carries ATTR, naturally spawned waves pass through untouched.
    for(let mode=0; mode<SIMULATION_MODES.length; mode++)
        wrapMode(mode);
})();

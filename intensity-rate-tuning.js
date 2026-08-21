// Raptor Mod 0.13.0: global Normal-mode intensity pacing.
// Slows routine strengthening across every basin while preserving rare, genuinely
// explosive RI when the ocean/thermodynamic/structural environment is exceptional.
(function(){
    const previousNormalCore = STORM_ALGORITHM[SIM_MODE_NORMAL].core;

    const findWind24HoursAgo = (storm,tick)=>{
        if(!(storm instanceof Storm)) return undefined;
        const target = tick-24;
        for(let i=storm.record.length-1;i>=0;i--){
            const t = storm.get_tick_from_record_index(i);
            if(t<=target){
                const d = storm.record[i];
                if(tropOrSub(d.type) || d.type===TROPWAVE)
                    return d.windSpeed;
                return undefined;
            }
        }
    };

    STORM_ALGORITHM[SIM_MODE_NORMAL].core = function(sys,u){
        const pressureBefore = sys.pressure;
        const windBefore = sys.windSpeed;

        previousNormalCore(sys,u);
        if(sys.kill) return;

        const proposedPressure = sys.pressure;
        const proposedWind = sys.windSpeed;
        const tropicalLike = sys.type===TROP || sys.type===SUBTROP || sys.type===TROPWAVE;

        // Leave extratropical intensity changes alone. This patch is specifically
        // about tropical-cyclone strengthening pacing in Normal mode.
        if(!tropicalLike) return;

        const lnd = u.land();
        const SST = u.f('SST');
        const moisture = u.f('moisture');
        const shear = u.f('shear').mag()+sys.interaction.shear;

        const veryFavorable = !lnd &&
            SST>=27.3 && moisture>=0.52 && shear<=3.5 &&
            sys.lowerWarmCore>=0.72 && sys.upperWarmCore>=0.62 &&
            sys.organization>=0.48;

        // RI is no longer something a merely decent environment can stumble into.
        // The storm needs warm water, real moisture, low shear, an established warm
        // core, and enough organization to actually exploit that environment.
        const exceptionalRI = !lnd &&
            SST>=28.0 && moisture>=0.60 && shear<=2.5 &&
            sys.lowerWarmCore>=0.82 && sys.upperWarmCore>=0.72 &&
            sys.organization>=0.62;

        const eliteRI = exceptionalRI &&
            SST>=29.2 && moisture>=0.72 && shear<=1.2 &&
            sys.lowerWarmCore>=0.94 && sys.upperWarmCore>=0.88 &&
            sys.organization>=0.84;

        // --- Pressure pacing --------------------------------------------------
        // Stock Normal mode moves 5% of the pressure gap each hour. Scaling the
        // proposed strengthening to 56% gives an effective ~2.8%/h baseline.
        // Exceptional RI environments are allowed somewhat faster deepening, but
        // still cannot teleport several dozen hPa downward in a handful of hours.
        if(proposedPressure < pressureBefore){
            let pressureScale = 0.56;
            let hourlyPressureCap = 1.35;
            if(veryFavorable){
                pressureScale = 0.62;
                hourlyPressureCap = 1.75;
            }
            if(exceptionalRI){
                pressureScale = 0.72;
                hourlyPressureCap = 2.25;
            }
            if(eliteRI){
                pressureScale = 0.82;
                hourlyPressureCap = 3.0;
            }

            const proposedDrop = pressureBefore-proposedPressure;
            const pacedDrop = min(proposedDrop*pressureScale,hourlyPressureCap);
            sys.pressure = pressureBefore-pacedDrop;
        }

        // --- Wind pacing ------------------------------------------------------
        // Stock winds use a 15%/h lerp toward the pressure-derived target. Normal
        // strengthening now uses 8%/h, rising only when the whole environment is
        // exceptionally supportive. Weakening remains whatever the existing core
        // calculated, so this does not make hostile-condition decay artificially slow.
        if(proposedWind > windBefore){
            let windRate = 0.08;
            if(veryFavorable) windRate = 0.09;
            if(exceptionalRI) windRate = 0.11;
            if(eliteRI) windRate = 0.13;

            const targetWind = map(sys.pressure,1030,900,1,160)*
                map(sys.lowerWarmCore,1,0,1,0.6);
            let pacedWind = targetWind>windBefore ?
                lerp(windBefore,targetWind,windRate) : windBefore;

            // Never let this wrapper strengthen faster than the physics beneath it
            // proposed. It is a governor, not an extra intensification source.
            pacedWind = min(pacedWind,proposedWind);

            // --- 24-hour RI governor -----------------------------------------
            // Ordinary favorable environments top out below the 30 kt / 24 h RI
            // threshold. True RI requires the exceptional gate above. Elite setups
            // can still produce the rare 45-60 kt/day monsters.
            const storm = sys.fetchStorm();
            const wind24 = findWind24HoursAgo(storm,sys.basin.tick);
            if(wind24!==undefined){
                let maxGain24 = 20;
                if(veryFavorable) maxGain24 = 29;
                if(exceptionalRI) maxGain24 = 45;
                if(eliteRI) maxGain24 = 60;
                const ceiling = wind24+maxGain24;
                pacedWind = min(pacedWind,max(windBefore,ceiling));
            }

            sys.windSpeed = pacedWind;
        }
    };

    window.__raptorIntensityRateTuning = {
        build: '0.13.0',
        baselinePressureScale: 0.56,
        baselineWindRate: 0.08,
        ordinary24hGainCap: 20,
        veryFavorable24hGainCap: 29,
        exceptional24hGainCap: 45,
        elite24hGainCap: 60
    };
})();

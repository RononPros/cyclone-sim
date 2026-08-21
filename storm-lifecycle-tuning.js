// Raptor Mod 0.9.0: Normal-mode storm recovery and weak-low lifecycle tuning.
// Established tropical cyclones now retain short-term structural memory and can
// re-intensify after temporary weakening when they return to genuinely favorable
// warm, moist, low-shear conditions. Genesis and hostile-condition weakening are
// still handled by the stock Normal-mode physics.
(function(){
    const originalNormalCore = STORM_ALGORITHM.defaults.core;

    STORM_ALGORITHM[SIM_MODE_NORMAL].core = function(sys,u){
        // Keep a snapshot from the beginning of the hour. The stock core still
        // runs first and remains the baseline physics for every storm.
        const pressureBefore = sys.pressure;
        const windBefore = sys.windSpeed;

        originalNormalCore(sys,u);
        if(sys.kill) return;

        const lnd = u.land();
        const SST = u.f('SST');
        const moisture = u.f('moisture');
        const shear = u.f('shear').mag() + sys.interaction.shear;
        const storm = sys.fetchStorm();

        // --- Structural memory -------------------------------------------------
        // An established TC remembers significant tropical intensity for 72 h.
        // This prevents a brief shear/dry-air encounter from making the cyclone
        // behave like a brand-new disturbance once conditions improve again.
        let recentPeakWind = windBefore;
        if(storm instanceof Storm){
            const cutoff = sys.basin.tick - 72;
            for(let i=storm.record.length-1;i>=0;i--){
                const tick = storm.get_tick_from_record_index(i);
                if(tick < cutoff) break;
                const d = storm.record[i];
                if(tropOrSub(d.type)) recentPeakWind = max(recentPeakWind,d.windSpeed);
            }
        }

        const warmStructure = sys.lowerWarmCore >= 0.68 && sys.upperWarmCore >= 0.58;
        const tropicalLike = sys.type === TROP || sys.type === SUBTROP || sys.type === TROPWAVE;

        // Active TCs get the recovery pathway only after meaningful weakening:
        // at least 50 kt recently and at least a 5 kt drop from that recent peak.
        const establishedRecovery = storm instanceof Storm && storm.TC && tropicalLike &&
            sys.type !== TROPWAVE && recentPeakWind >= 50 && recentPeakWind-windBefore >= 5;

        // Former TCs that have already fallen back to L/TROPWAVE keep the remnant
        // regeneration pathway. Ordinary never-developed tropical waves do not
        // receive this special boost; their genesis stays stock.
        const remnantRecovery = storm instanceof Storm && storm.TC &&
            sys.type === TROPWAVE;

        // Favorability is deliberately continuous rather than an on/off magic
        // switch. SST provides the energy; moisture and shear control how much of
        // that potential can actually be used for recovery.
        const sstFactor = map(SST,26.0,29.5,0,1,true);
        const moistureFactor = map(moisture,0.42,0.72,0,1,true);
        const shearFactor = map(shear,5.0,1.0,0,1,true);
        const favorability = sstFactor *
            (0.25 + 0.75*moistureFactor) *
            (0.15 + 0.85*shearFactor);

        const recoveryPotential = !lnd && warmStructure &&
            (establishedRecovery || remnantRecovery) &&
            SST >= 27 && moisture >= 0.42 && shear <= 5.0 && favorability >= 0.12;

        if(recoveryPotential){
            const intensityMemory = map(recentPeakWind,50,130,0,1,true);

            // Established storms rebuild inner-core organization faster than a
            // remnant, but neither gets organization for free. Better conditions
            // and a stronger recent cyclone both increase the recovery rate.
            let organizationTarget;
            let organizationRate;
            if(establishedRecovery){
                organizationTarget = constrain(0.78 + 0.16*favorability + 0.04*intensityMemory,0,0.98);
                organizationRate = 0.008 + 0.018*favorability + 0.004*intensityMemory;
            }else{
                organizationTarget = constrain(0.62 + 0.18*favorability + 0.03*intensityMemory,0,0.86);
                organizationRate = 0.006 + 0.014*favorability + 0.003*intensityMemory;
            }
            if(sys.organization < organizationTarget)
                sys.organization = lerp(sys.organization,organizationTarget,organizationRate);

            // The stock pressure potential uses organization^3. During genuine
            // re-intensification, use a gentler structural-memory curve so a
            // moderately weakened cyclone is not forced to redevelop from zero.
            // Remnants retain the slightly gentler ^2.0 curve from build 0.5.
            const potentialPressure = 1010 - 25*log(map(SST,25,30,1,2,true))/log(1.17);
            const exponent = establishedRecovery ? 2.2 : 2.0;
            const recoveryTarget = lerp(1010,potentialPressure,pow(sys.organization,exponent));

            // Re-deepening is allowed to approach roughly 6-7% per hour in very
            // favorable conditions, versus the stock 5% strengthening rate. Use
            // pressureBefore so this replaces an overly pessimistic stock result
            // for the hour instead of stacking two intensification steps.
            const lowerCoreFactor = map(sys.lowerWarmCore,0.68,1,0.55,1,true);
            const upperCoreFactor = map(sys.upperWarmCore,0.58,1,0.60,1,true);
            const coreFactor = lowerCoreFactor*upperCoreFactor;
            const pressureRate = (0.060 + 0.010*favorability)*coreFactor;
            if(recoveryTarget < pressureBefore){
                const recoveredPressure = lerp(pressureBefore,recoveryTarget,pressureRate);
                if(recoveredPressure < sys.pressure)
                    sys.pressure = recoveredPressure;
            }

            // Keep winds coupled to any recovered pressure. This only raises wind
            // when the pressure-based target is already stronger than the storm.
            const targetWind = map(sys.pressure,1030,900,1,160) *
                map(sys.lowerWarmCore,1,0,1,0.6);
            if(targetWind > sys.windSpeed){
                const windRate = establishedRecovery ?
                    0.13 + 0.05*favorability :
                    0.10 + 0.05*favorability;
                sys.windSpeed = lerp(sys.windSpeed,targetWind,windRate);
            }
        }

        // Weak-low timeout from build 0.5. A 1020+ hPa, sub-20 kt, nearly
        // unorganized L should not roam the map forever. It gets 18 simulated
        // hours to improve, and a genuine remnant recovery environment resets it.
        const weakLow = (sys.type === TROPWAVE || sys.type === EXTROP) &&
            sys.pressure > 1020 && sys.windSpeed < 20 && sys.organization < 0.10;

        if(weakLow && !recoveryPotential){
            sys.weakSystemHours = (sys.weakSystemHours || 0) + 1;
            if(sys.weakSystemHours >= 18)
                sys.kill = true;
        }else{
            sys.weakSystemHours = 0;
        }
    };
})();

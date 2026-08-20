// Normal-mode storm lifecycle tuning.
// Gives warm-core remnants a realistic path to regenerate over favorable warm
// water while allowing truly weak, disorganized lows to finally dissipate.
(function(){
    const originalNormalCore = STORM_ALGORITHM.defaults.core;

    STORM_ALGORITHM[SIM_MODE_NORMAL].core = function(sys,u){
        // Run the stock Normal-mode physics first.
        originalNormalCore(sys,u);
        if(sys.kill) return;

        const lnd = u.land();
        const SST = u.f('SST');
        const moisture = u.f('moisture');
        const shear = u.f('shear').mag() + sys.interaction.shear;

        // Warm-core Ls / tropical-wave remnants should be able to reorganize
        // over genuinely favorable warm water instead of being trapped by the
        // stock organization^3 pressure-potential curve.
        const warmCoreRemnant = sys.type === TROPWAVE &&
            sys.lowerWarmCore >= 0.70 && sys.upperWarmCore >= 0.62;

        let recoveryPotential = false;
        if(!lnd && warmCoreRemnant && SST >= 26.5){
            const sstFactor = map(SST,26.5,29.5,0,1,true);
            const moistureFactor = map(moisture,0.45,0.70,0,1,true);
            const shearFactor = map(shear,4.5,0.5,0,1,true);

            // SST is the main requirement; moisture and shear decide whether
            // recovery is merely possible or genuinely fast.
            const favorability = sstFactor *
                (0.35 + 0.65*moistureFactor) *
                (0.25 + 0.75*shearFactor);

            recoveryPotential = SST >= 27 && favorability >= 0.18;

            if(favorability > 0){
                // In very favorable conditions a badly degraded remnant can
                // rebuild from ~0.2 organization to tropical thresholds in
                // roughly 1.5-3 days rather than becoming effectively stuck.
                const organizationTarget = 0.60 + 0.12*favorability;
                const organizationRate = 0.006 + 0.012*favorability;
                sys.organization = lerp(sys.organization,organizationTarget,organizationRate);

                // Supplemental regeneration uses organization^2 instead of the
                // stock organization^3, but ONLY for warm-core remnants. This
                // preserves the normal intensification curve for active TCs.
                if(SST >= 25){
                    const potentialPressure = 1010 - 25*log(map(SST,25,30,1,2,true))/log(1.17);
                    const recoveryTarget = lerp(1010,potentialPressure,pow(sys.organization,2));
                    if(recoveryTarget < sys.pressure){
                        const pressureRate = 0.015 + 0.015*favorability;
                        sys.pressure = lerp(sys.pressure,recoveryTarget,pressureRate);

                        // Keep wind roughly coupled to the improved pressure so
                        // a recovering remnant can actually cross the tropical
                        // reclassification threshold once organization returns.
                        const targetWind = map(sys.pressure,1030,900,1,160) *
                            map(sys.lowerWarmCore,1,0,1,0.6);
                        if(targetWind > sys.windSpeed)
                            sys.windSpeed = lerp(sys.windSpeed,targetWind,0.10 + 0.05*favorability);
                    }
                }
            }
        }

        // Weak-low timeout. A 1020+ hPa, sub-20 kt, nearly unorganized L should
        // not roam the map forever. It gets 18 simulated hours to improve.
        // Entering genuinely favorable regeneration conditions resets the timer.
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

// Raptor Mod 0.8.0: safe storm deletion from the storm info panel.
// Removes the selected storm, its cross-season references and live ActiveSystem,
// then subtracts its cached season statistics without rewinding designation counters.
(function(){
    const originalUIInit = UI.init;

    UI.init = function(){
        originalUIInit.call(UI);

        let deletingStorm = false;

        const sameStormEntry = (entry,storm)=>{
            if(entry === storm) return true;
            if(entry instanceof StormRef){
                if(entry.ref === storm) return true;
                return entry.season === storm.originSeason() && entry.refId === storm.id;
            }
            return false;
        };

        const ensureYearContribution = (map,year)=>{
            if(!map[year]){
                map[year] = {
                    subBasins: {},
                    damageWeight: 0,
                    deathWeight: 0,
                    landfallWeight: 0,
                    damage: 0,
                    deaths: 0,
                    landfalls: 0
                };
            }
            return map[year];
        };

        const ensureSubContribution = (yearData,subId)=>{
            if(!yearData.subBasins[subId]){
                yearData.subBasins[subId] = {
                    ACE: 0,
                    classifications: new Set()
                };
            }
            return yearData.subBasins[subId];
        };

        const allocateFloatTotal = (byYear,total,weightKey,resultKey,fallbackYear)=>{
            total = Number(total) || 0;
            if(total <= 0) return;
            let weighted = Object.keys(byYear).filter(y=>byYear[y][weightKey] > 0);
            if(!weighted.length){
                ensureYearContribution(byYear,fallbackYear)[resultKey] += total;
                return;
            }
            const sum = weighted.reduce((a,y)=>a+byYear[y][weightKey],0);
            let remaining = Math.round(total*100)/100;
            for(let i=0;i<weighted.length;i++){
                const y = weighted[i];
                let amount;
                if(i===weighted.length-1){
                    amount = remaining;
                }else{
                    amount = Math.round(total*byYear[y][weightKey]/sum*100)/100;
                    remaining = Math.round((remaining-amount)*100)/100;
                }
                byYear[y][resultKey] += amount;
            }
        };

        const allocateIntegerTotal = (byYear,total,weightKey,resultKey,fallbackYear)=>{
            total = Math.max(0,Math.round(Number(total) || 0));
            if(total <= 0) return;
            let weighted = Object.keys(byYear).filter(y=>byYear[y][weightKey] > 0);
            if(!weighted.length){
                ensureYearContribution(byYear,fallbackYear)[resultKey] += total;
                return;
            }
            const sum = weighted.reduce((a,y)=>a+byYear[y][weightKey],0);
            const allocations = weighted.map(y=>{
                const exact = total*byYear[y][weightKey]/sum;
                return {y,amount:Math.floor(exact),fraction:exact-Math.floor(exact)};
            });
            let used = allocations.reduce((a,v)=>a+v.amount,0);
            allocations.sort((a,b)=>b.fraction-a.fraction);
            for(let i=0;used<total;i=(i+1)%allocations.length,used++) allocations[i].amount++;
            for(const a of allocations) byYear[a.y][resultKey] += a.amount;
        };

        const calculateContributions = storm=>{
            const basin = storm.basin;
            const byYear = {};
            let previousLand = false;
            let previousInMain = false;

            for(let i=0;i<storm.record.length;i++){
                const d = storm.record[i];
                const tick = storm.get_tick_from_record_index(i);
                const year = basin.getSeason(tick);
                const yearData = ensureYearContribution(byYear,year);
                const tropical = tropOrSub(d.type);
                const sub = land.getSubBasin(d.coord());
                const inMain = tropical && basin.subInBasin(sub);

                if(tropical){
                    for(const subId of basin.forSubBasinChain(sub)){
                        if(!basin.subInBasin(subId)) continue;
                        const subData = ensureSubContribution(yearData,subId);
                        const classification = basin.getScale(subId).get(d);
                        for(let c=0;c<=classification;c++) subData.classifications.add(c);
                        if(d.windSpeed >= ACE_WIND_THRESHOLD)
                            subData.ACE += Math.pow(d.windSpeed,2)/ACE_DIVISOR;
                    }
                }

                let isLand = false;
                if(inMain){
                    const landValue = land.get(d.coord());
                    isLand = !!landValue;
                    if(landValue){
                        const pop = Math.round(250000*(1+basin.hemY(d.pos.y)/HEIGHT)*Math.pow(0.8,map(landValue,0.5,1,0,30)));
                        yearData.damageWeight += Math.max(0,pop*(Math.pow(1.062,d.windSpeed)-1));
                        yearData.deathWeight += Math.max(0,pop*(Math.pow(1.045,d.windSpeed)-1));
                    }
                    if(isLand && !(previousInMain && previousLand))
                        yearData.landfallWeight++;
                }

                previousLand = isLand;
                previousInMain = inMain;
            }

            const fallbackYear = storm.inBasinTC ? storm.statisticalSeason() : storm.originSeason();
            ensureYearContribution(byYear,fallbackYear);
            allocateFloatTotal(byYear,storm.damage,'damageWeight','damage',fallbackYear);
            allocateIntegerTotal(byYear,storm.deaths,'deathWeight','deaths',fallbackYear);
            allocateIntegerTotal(byYear,storm.landfalls,'landfallWeight','landfalls',fallbackYear);

            // Match SeasonStats rounding for ACE.
            for(const year of Object.keys(byYear)){
                for(const subId of Object.keys(byYear[year].subBasins)){
                    const s = byYear[year].subBasins[subId];
                    s.ACE = Math.round(s.ACE*ACE_DIVISOR)/ACE_DIVISOR;
                }
            }
            return byYear;
        };

        const removeStatsContribution = (season,year,contribution)=>{
            if(!(season instanceof Season)) return;
            const basin = season.basin;

            if(contribution){
                for(const subId of Object.keys(contribution.subBasins)){
                    const stats = season.subBasinStats[subId];
                    if(!(stats instanceof SeasonStats)) continue;
                    const c = contribution.subBasins[subId];
                    stats.ACE = Math.max(0,Math.round((stats.ACE-c.ACE)*ACE_DIVISOR)/ACE_DIVISOR);
                    for(const classification of c.classifications){
                        const old = Number(stats.classificationCounters[classification]) || 0;
                        stats.classificationCounters[classification] = Math.max(0,old-1);
                    }
                }

                // Storm-level impact totals correspond to the main basin. For
                // storms spanning New Year, advisory/land exposure weights split
                // those totals between the affected seasons.
                const mainStats = season.stats(basin.mainSubBasin);
                mainStats.damage = Math.max(0,Math.round((mainStats.damage-contribution.damage)*100)/100);
                mainStats.deaths = Math.max(0,mainStats.deaths-contribution.deaths);
                mainStats.landfalls = Math.max(0,mainStats.landfalls-contribution.landfalls);
            }

            // Designation counters intentionally remain untouched so deleting a
            // storm cannot cause a later cyclone to reuse its number/name.
            for(const subId of Object.keys(season.subBasinStats)){
                const stats = season.subBasinStats[subId];
                if(!(stats instanceof SeasonStats)) continue;
                stats.most_intense = undefined;
                stats.update_most_intense(season);
            }

            season.modified = true;
        };

        const deleteStorm = async storm=>{
            if(!(storm instanceof Storm) || deletingStorm) return;
            const basin = storm.basin;
            if(!(basin instanceof Basin)) return;

            deletingStorm = true;
            try{
                const contributions = calculateContributions(storm);
                const affectedYears = new Set(Object.keys(contributions).map(Number));
                affectedYears.add(storm.originSeason());
                if(storm.inBasinTC) affectedYears.add(storm.statisticalSeason());

                // Include any already-loaded season that happens to reference the
                // storm, then make sure every season crossed by the storm is loaded.
                for(const y of Object.keys(basin.seasons)){
                    const season = basin.seasons[y];
                    if(season instanceof Season && season.systems.some(e=>sameStormEntry(e,storm)))
                        affectedYears.add(Number(y));
                }

                await Promise.all([...affectedYears].map(y=>basin.fetchSeason(y,false,false,true)));

                // Load origin seasons for remaining StormRefs too, so rebuilding
                // Most Intense cannot accidentally ignore a cross-year cyclone.
                const refOrigins = new Set();
                for(const y of affectedYears){
                    const season = basin.seasons[y];
                    if(!(season instanceof Season)) continue;
                    for(const entry of season.systems){
                        if(entry instanceof StormRef && !sameStormEntry(entry,storm))
                            refOrigins.add(entry.season);
                    }
                }
                await Promise.all([...refOrigins].map(y=>basin.fetchSeason(y,false,false,true)));

                // Remove a currently-live version immediately.
                for(let i=basin.activeSystems.length-1;i>=0;i--){
                    const active = basin.activeSystems[i];
                    const entry = active.storm;
                    const matches = entry===storm ||
                        (entry instanceof StormRef && entry.season===storm.originSeason() && entry.refId===storm.id);
                    if(matches) basin.activeSystems.splice(i,1);
                }
                storm.current = undefined;

                // Remove the actual Storm from its origin season and every
                // cross-season StormRef that points back to it.
                for(const y of affectedYears){
                    const season = basin.seasons[y];
                    if(!(season instanceof Season)) continue;
                    const before = season.systems.length;
                    season.systems = season.systems.filter(entry=>!sameStormEntry(entry,storm));
                    if(season.systems.length!==before) season.modified = true;
                    if(Number(y)===storm.originSeason()) delete season.idSystemCache[storm.id];
                }

                // Subtract its cached statistics after references are gone, so
                // Most Intense is rebuilt from the surviving systems only.
                for(const y of affectedYears){
                    const season = basin.seasons[y];
                    if(season instanceof Season)
                        removeStatsContribution(season,Number(y),contributions[y]);
                }

                selectedStorm = undefined;
                const fallbackSeason = storm.inBasinTC ? storm.statisticalSeason() : storm.originSeason();
                stormInfoPanel.target = fallbackSeason;
                forecastTracks.clear();
                refreshTracks(true);

                // A deletion changes save data without advancing simulation time.
                // Force the Save Basin button to stop claiming everything is saved.
                basin.lastSaved = -1;

                // Expose a monotonically increasing revision for UI/debugging.
                window.__raptorStormDeleteRevision = (window.__raptorStormDeleteRevision || 0) + 1;
                console.info('Raptor Mod: deleted storm and updated season statistics.',storm);
            }catch(err){
                console.error('Raptor Mod: storm deletion failed',err);
            }finally{
                deletingStorm = false;
            }
        };

        // Useful from the console too, but the normal entry point is the button.
        window.deleteStormFromBasin = deleteStorm;

        // The stock panel already reserves the last two rows for Jump To and
        // View Timeline. Put Delete Storm one row above those controls.
        const deleteButton = stormInfoPanel.append(false,30,stormInfoPanel.height-81,stormInfoPanel.width-60,24,function(s){
            const target = stormInfoPanel.target;
            const visible = target instanceof Storm;
            this.setBox(30,stormInfoPanel.height-81,visible ? stormInfoPanel.width-60 : 0,24);
            if(visible) s.button('Delete Storm',true,15,!paused || deletingStorm);
        },function(){
            const storm = stormInfoPanel.target;
            if(!(storm instanceof Storm) || !paused || deletingStorm) return;
            let label = storm.getNameByTick(-1) || storm.getFullNameByTick('peak') || 'this storm';
            if(label.length>30) label = label.slice(0,27)+'...';
            areYouSure.dialog(()=>{
                deleteStorm(storm);
            },'Delete "'+label+'"?');
        });

        // Keep a reference for debugging/layout inspection.
        window.__raptorDeleteStormButton = deleteButton;
    };
})();

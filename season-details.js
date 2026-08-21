// Raptor Mod 0.11.0: full Season Details dashboard.
// Adds a full-screen, tabbed statistical deep-dive without changing simulation physics.
(function(){
    const BUILD = '0.11.0';
    const BUILD_DATE = '21 Aug 2026';

    window.RAPTOR_MOD_BUILD = BUILD;
    if(Array.isArray(window.RAPTOR_MOD_CHANGELOG) &&
       !window.RAPTOR_MOD_CHANGELOG.some(r=>r.build===BUILD)){
        window.RAPTOR_MOD_CHANGELOG.unshift({
            build: BUILD,
            date: BUILD_DATE,
            changes: [
                'Added a full-screen Season Details dashboard opened directly from the season overview.',
                'Added Summary, Intensity, Timing, Impacts, and Monthly tabs with reconstructed season statistics from advisory records.',
                'Added storm/named/typhoon days, active-TC days, peak simultaneous systems, ACE concentration and monthly ACE metrics.',
                'Added peak-intensity averages, median peak wind, 100/120/140 kt counts, rapid intensification, fastest 24-hour wind/pressure changes, category jumps, and re-intensification records.',
                'Added first/last activity dates, longest and shortest-lived systems, quiet gaps, busiest 30-day windows, and earliest/latest forming systems.',
                'Added impact leaders, strongest sampled landfall, damage/death efficiency metrics, and a 12-month activity/ACE/intensity table.',
                'Added a deterministic Season Character summary generated from the season statistics rather than external or AI-generated data.'
            ]
        });
    }

    const previousUIInit = UI.init;

    UI.init = function(){
        previousUIInit.call(UI);

        const mainBuildMarker = mainMenu.children.find(u=>
            u.renderFunc && u.renderFunc.toString().includes('Raptor Mod build')
        );
        if(mainBuildMarker){
            mainBuildMarker.renderFunc = function(){
                fill(COLORS.UI.text);
                noStroke();
                textAlign(CENTER,CENTER);
                textStyle(NORMAL);
                textSize(14);
                text('Raptor Mod build ' + BUILD + '  |  Base v' + VERSION_NUMBER,0,0);
            };
        }

        const walk = (node,pred)=>{
            if(pred(node)) return node;
            for(const child of node.children || []){
                const found = walk(child,pred);
                if(found) return found;
            }
        };
        let changelogHeader;
        for(const root of UI.elements){
            changelogHeader = walk(root,u=>
                u.renderFunc && u.renderFunc.toString().includes('Raptor Mod Changelog')
            );
            if(changelogHeader) break;
        }
        if(changelogHeader){
            changelogHeader.renderFunc = function(){
                fill(COLORS.UI.text);
                noStroke();
                textAlign(CENTER,CENTER);
                textStyle(NORMAL);
                textSize(34);
                text('Raptor Mod Changelog',0,0);
                textSize(15);
                text('Current build: ' + BUILD + '  |  ' + BUILD_DATE + '  |  Base v' + VERSION_NUMBER,0,34);
                textSize(12);
                text('Mouse wheel to scroll',0,56);
            };
        }

        const TABS = ['Summary','Intensity','Timing','Impacts','Monthly'];
        let activeTab = 0;
        let targetSeason;
        let cacheTarget;
        let cacheAdvisory = -1;
        let cacheData;
        let loadingTarget;

        const clampText = (txt,maxWidth,size,minSize)=>{
            txt = txt===undefined || txt===null ? 'N/A' : ''+txt;
            let s = size;
            textSize(s);
            while(s>minSize && textWidth(txt)>maxWidth){
                s--;
                textSize(s);
            }
            if(textWidth(txt)<=maxWidth) return txt;
            let out = txt;
            while(out.length>2 && textWidth(out+'…')>maxWidth)
                out = out.slice(0,-1);
            return out+'…';
        };

        const roundTo = (v,n)=>{
            if(v===undefined || v===null || Number.isNaN(v)) return undefined;
            const p = Math.pow(10,n || 0);
            return Math.round(v*p)/p;
        };

        const fmtACE = v=>{
            if(v===undefined || v===null || Number.isNaN(v)) return 'N/A';
            return ''+roundTo(v,4);
        };

        const fmtDuration = hours=>{
            if(hours===undefined || hours===null || !Number.isFinite(hours)) return 'N/A';
            if(hours < 24) return roundTo(hours,1) + ' h';
            const days = hours/24;
            return roundTo(days,days<10 ? 1 : 0) + ' d';
        };

        const fmtDate = (basin,t)=>{
            if(t===undefined || t===null || !Number.isFinite(t)) return 'N/A';
            return formatDate(basin.tickMoment(t));
        };

        const stormName = storm=>{
            if(!(storm instanceof Storm)) return 'N/A';
            return storm.getNameByTick(-1) || storm.getNameByTick(-2) || storm.getFullNameByTick('peak') || 'Unnamed';
        };

        const findTyphoonIndex = scale=>{
            for(const row of scale.statDisplay()){
                if(/^(Typhoons|Hurricanes|Cyclones)$/i.test((''+row.statName).trim()))
                    return row.cNumber;
            }
            for(let i=1;i<scale.classifications.length;i++){
                const nom = scale.getStormNom(i,false);
                if(/^(Typhoon|Hurricane|Cyclone)$/i.test((''+nom).trim()))
                    return i;
            }
            return Math.min(2,Math.max(1,scale.classifications.length-1));
        };

        const getTyphoonLabel = (scale,index)=>{
            let nom = scale.getStormNom(index,false) || 'Typhoon';
            if(/hurricane/i.test(nom)) return 'Hurricane';
            if(/cyclone/i.test(nom) && !/tropical cyclone/i.test(nom)) return 'Cyclone';
            if(/typhoon/i.test(nom)) return 'Typhoon';
            return 'Typhoon';
        };

        const monthIndexForTick = (basin,startMoment,t)=>{
            const m = basin.tickMoment(t);
            return (m.year()-startMoment.year())*12 + (m.month()-startMoment.month());
        };

        const buildSeasonData = target=>{
            const basin = UI.viewBasin;
            const season = basin.fetchSeason(target);
            if(!(season instanceof Season)){
                if(loadingTarget!==target){
                    loadingTarget = target;
                    basin.fetchSeason(target,false,false,()=>{
                        loadingTarget = undefined;
                        cacheTarget = undefined;
                    });
                }
                return null;
            }

            const stats = season.stats(basin.mainSubBasin);
            const scale = basin.getScale(basin.mainSubBasin);
            const namingIndex = scale.namingThreshold;
            const typhoonIndex = findTyphoonIndex(scale);
            const typhoonLabel = getTyphoonLabel(scale,typhoonIndex);
            const startTick = basin.seasonTick(target);
            const endTick = basin.seasonTick(target+1);
            const startMoment = basin.tickMoment(startTick).clone();
            const months = [];
            for(let i=0;i<12;i++){
                const m = startMoment.clone().add(i,'months');
                months.push({
                    label: m.format('MMM').toUpperCase(),
                    systems: new Set(),
                    named: new Set(),
                    ace: 0,
                    peakWind: undefined,
                    minPressure: undefined,
                    landfalls: 0
                });
            }

            const systems = [];
            const seen = new Set();
            for(const sys of season.forSystems()){
                if(sys instanceof Storm && !seen.has(sys)){
                    seen.add(sys);
                    systems.push(sys);
                }
            }

            const infos = [];
            const activeCounts = new Map();
            const activeDays = new Set();
            const namedActivityIntervals = [];
            const landfallEvents = [];

            let firstTC;
            let firstNamed;
            let firstTyphoon;
            let lastNamed;
            let lastTyphoon;

            let totalStormHours = 0;
            let totalNamedHours = 0;
            let totalTyphoonHours = 0;
            let aceTyphoon = 0;
            let aceWeaker = 0;

            let fastestWindGain;
            let fastestPressureDrop;
            let biggestCategoryJump;
            let biggestComeback;
            let rapidIntensifiers = 0;
            let typhoonRegainers = 0;

            for(const storm of systems){
                const records = [];
                let prevRaw;
                let inferredLandfalls = 0;

                for(let i=0;i<storm.record.length;i++){
                    const d = storm.record[i];
                    const t = storm.get_tick_from_record_index(i);
                    if(t<startTick || t>=endTick){
                        prevRaw = d;
                        continue;
                    }
                    const inBasinTrop = tropOrSub(d.type) && land.inBasin(d.coord());
                    const onLand = !!land.get(d.coord());
                    if(inBasinTrop){
                        const cat = scale.get(d);
                        const named = cat>=namingIndex;
                        const typhoon = cat>=typhoonIndex;
                        const rec = {d,t,cat,named,typhoon,onLand};
                        records.push(rec);

                        const mi = monthIndexForTick(basin,startMoment,t);
                        if(mi>=0 && mi<12){
                            const month = months[mi];
                            month.systems.add(storm);
                            if(named) month.named.add(storm);
                            month.peakWind = month.peakWind===undefined ? d.windSpeed : Math.max(month.peakWind,d.windSpeed);
                            month.minPressure = month.minPressure===undefined ? d.pressure : Math.min(month.minPressure,d.pressure);
                        }

                        activeCounts.set(t,(activeCounts.get(t)||0)+1);
                        activeDays.add(basin.tickMoment(t).format('YYYY-MM-DD'));
                        totalStormHours += ADVISORY_TICKS;
                        if(named) totalNamedHours += ADVISORY_TICKS;
                        if(typhoon) totalTyphoonHours += ADVISORY_TICKS;

                        if(d.windSpeed>=ACE_WIND_THRESHOLD){
                            const a = Math.pow(d.windSpeed,2)/ACE_DIVISOR;
                            if(mi>=0 && mi<12) months[mi].ace += a;
                            if(typhoon) aceTyphoon += a;
                            else aceWeaker += a;
                        }

                        if(firstTC===undefined || t<firstTC.t) firstTC = {storm,t};
                        if(named){
                            if(firstNamed===undefined || t<firstNamed.t) firstNamed = {storm,t};
                            if(lastNamed===undefined || t>lastNamed.t) lastNamed = {storm,t};
                        }
                        if(typhoon){
                            if(firstTyphoon===undefined || t<firstTyphoon.t) firstTyphoon = {storm,t};
                            if(lastTyphoon===undefined || t>lastTyphoon.t) lastTyphoon = {storm,t};
                        }
                    }

                    if(inBasinTrop && onLand && prevRaw && !land.get(prevRaw.coord())){
                        inferredLandfalls++;
                        const cat = scale.get(d);
                        const event = {storm,t,d,cat};
                        landfallEvents.push(event);
                        const mi = monthIndexForTick(basin,startMoment,t);
                        if(mi>=0 && mi<12) months[mi].landfalls++;
                    }
                    prevRaw = d;
                }

                if(!records.length) continue;

                let peakWindRec = records[0];
                let peakPressureRec = records[0];
                let peakCat = records[0].cat;
                let ace = 0;
                let namedHours = 0;
                let typhoonHours = 0;
                let namedStart;
                let namedEnd;
                let firstTyphoonReached = false;
                let fellBelowTyphoon = false;
                let regainedTyphoon = false;

                for(const r of records){
                    if(r.d.windSpeed>peakWindRec.d.windSpeed) peakWindRec = r;
                    if(r.d.pressure<peakPressureRec.d.pressure) peakPressureRec = r;
                    if(r.cat>peakCat) peakCat = r.cat;
                    if(r.d.windSpeed>=ACE_WIND_THRESHOLD)
                        ace += Math.pow(r.d.windSpeed,2)/ACE_DIVISOR;
                    if(r.named){
                        namedHours += ADVISORY_TICKS;
                        if(namedStart===undefined) namedStart = r.t;
                        namedEnd = r.t+ADVISORY_TICKS;
                    }
                    if(r.typhoon){
                        typhoonHours += ADVISORY_TICKS;
                        if(firstTyphoonReached && fellBelowTyphoon) regainedTyphoon = true;
                        firstTyphoonReached = true;
                    }else if(firstTyphoonReached){
                        fellBelowTyphoon = true;
                    }
                }

                if(namedStart!==undefined)
                    namedActivityIntervals.push({start:namedStart,end:namedEnd,storm});
                if(regainedTyphoon) typhoonRegainers++;

                let stormFastGain;
                let stormFastDrop;
                let stormCatJump;
                for(let i=0;i<records.length;i++){
                    for(let j=i+1;j<records.length;j++){
                        const dt = records[j].t-records[i].t;
                        if(dt<24) continue;
                        if(dt>24) break;
                        const windGain = records[j].d.windSpeed-records[i].d.windSpeed;
                        const pressureDrop = records[i].d.pressure-records[j].d.pressure;
                        const catJump = records[j].cat-records[i].cat;
                        if(!stormFastGain || windGain>stormFastGain.value)
                            stormFastGain = {value:windGain,storm,start:records[i].t,end:records[j].t};
                        if(!stormFastDrop || pressureDrop>stormFastDrop.value)
                            stormFastDrop = {value:pressureDrop,storm,start:records[i].t,end:records[j].t};
                        if(!stormCatJump || catJump>stormCatJump.value)
                            stormCatJump = {value:catJump,storm,start:records[i].t,end:records[j].t};
                        break;
                    }
                }
                if(stormFastGain && stormFastGain.value>=30) rapidIntensifiers++;
                if(stormFastGain && (!fastestWindGain || stormFastGain.value>fastestWindGain.value)) fastestWindGain = stormFastGain;
                if(stormFastDrop && (!fastestPressureDrop || stormFastDrop.value>fastestPressureDrop.value)) fastestPressureDrop = stormFastDrop;
                if(stormCatJump && (!biggestCategoryJump || stormCatJump.value>biggestCategoryJump.value)) biggestCategoryJump = stormCatJump;

                let runningPeak = records[0].d.windSpeed;
                let declineActive = false;
                let trough = runningPeak;
                let troughTick = records[0].t;
                let comeback;
                for(let i=1;i<records.length;i++){
                    const r = records[i];
                    const w = r.d.windSpeed;
                    if(!declineActive){
                        if(runningPeak-w>=5){
                            declineActive = true;
                            trough = w;
                            troughTick = r.t;
                        }else if(w>runningPeak){
                            runningPeak = w;
                        }
                    }else{
                        if(w<trough){
                            trough = w;
                            troughTick = r.t;
                        }
                        const gain = w-trough;
                        if(gain>0 && (!comeback || gain>comeback.value))
                            comeback = {value:gain,storm,start:troughTick,end:r.t};
                        if(w>runningPeak){
                            runningPeak = w;
                            declineActive = false;
                        }
                    }
                }
                if(comeback && (!biggestComeback || comeback.value>biggestComeback.value)) biggestComeback = comeback;

                const info = {
                    storm,
                    records,
                    firstTick: records[0].t,
                    lastTick: records[records.length-1].t,
                    activeHours: records.length*ADVISORY_TICKS,
                    namedHours,
                    typhoonHours,
                    peakWind: peakWindRec.d.windSpeed,
                    peakWindTick: peakWindRec.t,
                    minPressure: peakPressureRec.d.pressure,
                    minPressureTick: peakPressureRec.t,
                    peakCat,
                    ace: roundTo(ace,4),
                    inferredLandfalls,
                    regainedTyphoon
                };
                infos.push(info);
            }

            for(const month of months) month.ace = roundTo(month.ace,4) || 0;
            aceTyphoon = roundTo(aceTyphoon,4) || 0;
            aceWeaker = roundTo(aceWeaker,4) || 0;

            let peakSimultaneous = 0;
            let peakSimTick;
            for(const [tick,count] of activeCounts){
                if(count>peakSimultaneous){
                    peakSimultaneous = count;
                    peakSimTick = tick;
                }
            }

            const namedInfos = infos.filter(i=>i.namedHours>0);
            const typhoonInfos = infos.filter(i=>i.typhoonHours>0);
            const peakWinds = infos.map(i=>i.peakWind).sort((a,b)=>a-b);
            const avgPeakWind = peakWinds.length ? peakWinds.reduce((a,b)=>a+b,0)/peakWinds.length : undefined;
            const avgPeakPressure = infos.length ? infos.reduce((a,b)=>a+b.minPressure,0)/infos.length : undefined;
            let medianPeakWind;
            if(peakWinds.length){
                const mid = Math.floor(peakWinds.length/2);
                medianPeakWind = peakWinds.length%2 ? peakWinds[mid] : (peakWinds[mid-1]+peakWinds[mid])/2;
            }
            const avgPeakCat = infos.length ? infos.reduce((a,b)=>a+b.peakCat,0)/infos.length : undefined;

            const strongestPressure = infos.reduce((best,i)=>!best || i.minPressure<best.minPressure ? i : best,undefined);
            const strongestWind = infos.reduce((best,i)=>!best || i.peakWind>best.peakWind ? i : best,undefined);
            const topACE = infos.reduce((best,i)=>!best || i.ace>best.ace ? i : best,undefined);
            const longest = infos.reduce((best,i)=>!best || i.activeHours>best.activeHours ? i : best,undefined);
            const shortestNamed = namedInfos.reduce((best,i)=>!best || i.namedHours<best.namedHours ? i : best,undefined);
            const latestForming = infos.reduce((best,i)=>!best || i.firstTick>best.firstTick ? i : best,undefined);
            const earliestForming = infos.reduce((best,i)=>!best || i.firstTick<best.firstTick ? i : best,undefined);

            namedActivityIntervals.sort((a,b)=>a.start-b.start);
            const merged = [];
            for(const it of namedActivityIntervals){
                if(!merged.length || it.start>merged[merged.length-1].end)
                    merged.push({start:it.start,end:it.end});
                else
                    merged[merged.length-1].end = Math.max(merged[merged.length-1].end,it.end);
            }
            let quietGap;
            for(let i=1;i<merged.length;i++){
                const gap = merged[i].start-merged[i-1].end;
                if(!quietGap || gap>quietGap.hours)
                    quietGap = {hours:gap,start:merged[i-1].end,end:merged[i].start};
            }

            let busiest30;
            const seasonEndForSearch = Math.min(endTick,basin.tick+1);
            for(let ws=startTick;ws<seasonEndForSearch;ws+=24){
                const we = Math.min(ws+30*24,endTick);
                const stormSet = new Set();
                let ace = 0;
                for(const info of namedInfos){
                    for(const r of info.records){
                        if(r.t>=ws && r.t<we && r.named){
                            stormSet.add(info.storm);
                            if(r.d.windSpeed>=ACE_WIND_THRESHOLD)
                                ace += Math.pow(r.d.windSpeed,2)/ACE_DIVISOR;
                        }
                    }
                }
                const cand = {start:ws,end:we,count:stormSet.size,ace};
                if(!busiest30 || cand.count>busiest30.count ||
                   (cand.count===busiest30.count && cand.ace>busiest30.ace))
                    busiest30 = cand;
            }

            const strongestLandfall = landfallEvents.reduce((best,e)=>{
                if(!best) return e;
                if(e.d.windSpeed>best.d.windSpeed) return e;
                if(e.d.windSpeed===best.d.windSpeed && e.d.pressure<best.d.pressure) return e;
                return best;
            },undefined);

            const impactInfos = infos.filter(i=>i.storm.statisticalSeason()===target);
            const mostDamaging = impactInfos.reduce((best,i)=>!best || i.storm.damage>best.storm.damage ? i : best,undefined);
            const deadliest = impactInfos.reduce((best,i)=>!best || i.storm.deaths>best.storm.deaths ? i : best,undefined);
            const mostLandfalls = impactInfos.reduce((best,i)=>!best || i.storm.landfalls>best.storm.landfalls ? i : best,undefined);
            const stormsWithDamage = impactInfos.filter(i=>i.storm.damage>0).length;
            const stormsWithDeaths = impactInfos.filter(i=>i.storm.deaths>0).length;
            const landfallingStorms = new Set(landfallEvents.map(e=>e.storm)).size;

            const reached100 = infos.filter(i=>i.peakWind>=100).length;
            const reached120 = infos.filter(i=>i.peakWind>=120).length;
            const reached140 = infos.filter(i=>i.peakWind>=140).length;

            let maxACEMonth = 0;
            for(let i=1;i<months.length;i++) if(months[i].ace>months[maxACEMonth].ace) maxACEMonth=i;

            const totalACE = stats.ACE || 0;
            const topACEShare = topACE && totalACE>0 ? 100*topACE.ace/totalACE : 0;
            const typhoonACEShare = totalACE>0 ? 100*aceTyphoon/(aceTyphoon+aceWeaker || totalACE) : 0;

            const highEndCount = infos.filter(i=>i.peakWind>=120).length;
            const namedCount = namedInfos.length;
            const typhoonCount = typhoonInfos.length;
            let activityWord = namedCount>=25 ? 'Hyperactive' : namedCount>=18 ? 'Active' : namedCount>=10 ? 'Busy' : 'Compact';
            let intensityWord;
            if(namedCount && (highEndCount/namedCount>=0.25 || reached140>=2)) intensityWord = 'top-heavy';
            else if(namedCount && typhoonCount/namedCount>=0.45) intensityWord = 'strong';
            else intensityWord = 'mixed-intensity';
            let impactWord;
            if(stats.landfalls>=6 || stats.deaths>=500 || stats.damage>=1e9) impactWord = 'high-impact';
            else if(stats.landfalls>=3 || stats.deaths>=100 || stats.damage>=1e8) impactWord = 'impactful';
            else impactWord = 'lower-impact';
            const concentrationWord = topACEShare>=30 ? 'ACE-concentrated' : 'broad-ACE';
            const character = activityWord + ', ' + intensityWord + ', ' + impactWord + ', ' + concentrationWord;

            return {
                basin,season,stats,scale,target,startTick,endTick,startMoment,months,infos,
                namingIndex,typhoonIndex,typhoonLabel,
                namedInfos,typhoonInfos,
                totalStormHours,totalNamedHours,totalTyphoonHours,
                activeDays:activeDays.size,peakSimultaneous,peakSimTick,
                aceTyphoon,aceWeaker,typhoonACEShare,
                avgPeakWind,avgPeakPressure,medianPeakWind,avgPeakCat,
                strongestPressure,strongestWind,topACE,longest,shortestNamed,
                earliestForming,latestForming,
                firstTC,firstNamed,firstTyphoon,lastNamed,lastTyphoon,
                quietGap,busiest30,strongestLandfall,
                mostDamaging,deadliest,mostLandfalls,
                stormsWithDamage,stormsWithDeaths,landfallingStorms,
                reached100,reached120,reached140,
                rapidIntensifiers,fastestWindGain,fastestPressureDrop,biggestCategoryJump,biggestComeback,typhoonRegainers,
                maxACEMonth,topACEShare,character,
                totalSystemCount:season.totalSystemCount || systems.length,
                inBasinSystems:infos.length
            };
        };

        const getData = ()=>{
            if(targetSeason===undefined || !(UI.viewBasin instanceof Basin)) return null;
            const advisory = Math.floor(UI.viewBasin.tick/ADVISORY_TICKS);
            const currentSeason = UI.viewBasin.getSeason(UI.viewBasin.tick);
            const shouldRefresh = cacheTarget!==targetSeason || !cacheData ||
                (targetSeason===currentSeason && advisory!==cacheAdvisory);
            if(shouldRefresh){
                cacheData = buildSeasonData(targetSeason);
                cacheTarget = targetSeason;
                cacheAdvisory = advisory;
            }
            return cacheData;
        };

        const drawCard = (x,y,w,h,title)=>{
            fill(COLORS.UI.buttonBox);
            noStroke();
            rect(x,y,w,h,6);
            fill(COLORS.UI.text);
            textAlign(LEFT,TOP);
            textStyle(BOLD);
            textSize(11);
            text(title,x+10,y+8);
            textStyle(NORMAL);
        };

        const drawMetricGrid = (items,x,y,w,h,cols)=>{
            const gap = 7;
            const rows = Math.ceil(items.length/cols);
            const cw = (w-gap*(cols-1))/cols;
            const ch = (h-gap*(rows-1))/rows;
            for(let i=0;i<items.length;i++){
                const item = items[i];
                const col = i%cols;
                const row = Math.floor(i/cols);
                const cx = x+col*(cw+gap);
                const cy = y+row*(ch+gap);
                fill(COLORS.UI.buttonBox);
                noStroke();
                rect(cx,cy,cw,ch,5);
                fill(COLORS.UI.text);
                textAlign(CENTER,TOP);
                textStyle(NORMAL);
                textSize(10);
                text(item.label,cx+cw/2,cy+7);
                textStyle(BOLD);
                const value = clampText(item.value,cw-14,17,10);
                text(value,cx+cw/2,cy+23);
                if(item.sub){
                    textStyle(NORMAL);
                    const sub = clampText(item.sub,cw-12,9,8);
                    text(sub,cx+cw/2,cy+ch-15);
                }
            }
            textStyle(NORMAL);
        };

        const renderSummary = d=>{
            const x=18, w=WIDTH-36;
            drawCard(x,112,w,62,'SEASON CHARACTER');
            fill(COLORS.UI.text);
            textAlign(LEFT,TOP);
            textStyle(BOLD);
            textSize(18);
            text(d.character,x+12,134);
            textStyle(NORMAL);
            textSize(10);
            const desc = d.namedInfos.length + ' named storms • ' + d.typhoonInfos.length + ' ' + d.typhoonLabel.toLowerCase() + 's • ' + fmtACE(d.stats.ACE) + ' ACE • ' + d.stats.landfalls + ' landfalls';
            text(desc,x+12,158);

            const topStorm = d.topACE;
            const items = [
                {label:'TOTAL SPAWNED SYSTEMS',value:d.totalSystemCount},
                {label:'IN-BASIN TCs',value:d.inBasinSystems},
                {label:'NAMED STORMS',value:d.namedInfos.length},
                {label:d.typhoonLabel.toUpperCase()+'S',value:d.typhoonInfos.length},
                {label:'STORM DAYS',value:fmtDuration(d.totalStormHours)},
                {label:'NAMED-STORM DAYS',value:fmtDuration(d.totalNamedHours)},
                {label:d.typhoonLabel.toUpperCase()+' DAYS',value:fmtDuration(d.totalTyphoonHours)},
                {label:'DAYS WITH ACTIVE TC',value:d.activeDays},
                {label:'PEAK SIMULTANEOUS TCs',value:d.peakSimultaneous,sub:fmtDate(d.basin,d.peakSimTick)},
                {label:'TOTAL ACE',value:fmtACE(d.stats.ACE)},
                {label:'ACE / NAMED STORM',value:d.namedInfos.length ? fmtACE(d.stats.ACE/d.namedInfos.length) : 'N/A'},
                {label:'TOP STORM ACE',value:topStorm ? fmtACE(topStorm.ace) : 'N/A',sub:topStorm ? stormName(topStorm.storm) : ''},
                {label:'TOP STORM ACE SHARE',value:roundTo(d.topACEShare,1)+'%'},
                {label:d.typhoonLabel.toUpperCase()+'-STRENGTH ACE',value:fmtACE(d.aceTyphoon),sub:roundTo(d.typhoonACEShare,1)+'% of reconstructed ACE'},
                {label:'WEAKER-TC ACE',value:fmtACE(d.aceWeaker)},
                {label:'MOST ACE-ACTIVE MONTH',value:d.months[d.maxACEMonth].label+' • '+fmtACE(d.months[d.maxACEMonth].ace)}
            ];
            drawMetricGrid(items,x,183,w,337,4);
        };

        const renderIntensity = d=>{
            const meanCat = d.avgPeakCat===undefined ? 'N/A' : d.scale.getClassificationName(constrain(Math.round(d.avgPeakCat),0,d.scale.classifications.length-1));
            const items = [
                {label:'LOWEST PRESSURE',value:d.strongestPressure ? d.strongestPressure.minPressure+' hPa' : 'N/A',sub:d.strongestPressure ? stormName(d.strongestPressure.storm) : ''},
                {label:'HIGHEST WIND',value:d.strongestWind ? displayWindspeed(d.strongestWind.peakWind) : 'N/A',sub:d.strongestWind ? stormName(d.strongestWind.storm) : ''},
                {label:'AVERAGE PEAK PRESSURE',value:d.avgPeakPressure===undefined ? 'N/A' : Math.round(d.avgPeakPressure)+' hPa'},
                {label:'AVERAGE PEAK WIND',value:d.avgPeakWind===undefined ? 'N/A' : displayWindspeed(d.avgPeakWind)},
                {label:'MEDIAN PEAK WIND',value:d.medianPeakWind===undefined ? 'N/A' : displayWindspeed(d.medianPeakWind)},
                {label:'MEAN PEAK CLASSIFICATION',value:meanCat,sub:d.avgPeakCat===undefined ? '' : 'Mean index '+roundTo(d.avgPeakCat,2)},
                {label:'PEAK ≥100 kt',value:d.reached100+' storms'},
                {label:'PEAK ≥120 kt',value:d.reached120+' storms'},
                {label:'PEAK ≥140 kt',value:d.reached140+' storms'},
                {label:'RAPID INTENSIFIERS',value:d.rapidIntensifiers,sub:'≥30 kt in 24 h'},
                {label:'FASTEST 24H WIND GAIN',value:d.fastestWindGain ? '+'+displayWindspeed(d.fastestWindGain.value) : 'N/A',sub:d.fastestWindGain ? stormName(d.fastestWindGain.storm) : ''},
                {label:'FASTEST 24H PRESSURE FALL',value:d.fastestPressureDrop ? d.fastestPressureDrop.value+' hPa' : 'N/A',sub:d.fastestPressureDrop ? stormName(d.fastestPressureDrop.storm) : ''},
                {label:'BIGGEST 24H CATEGORY JUMP',value:d.biggestCategoryJump ? '+'+d.biggestCategoryJump.value+' categories' : 'N/A',sub:d.biggestCategoryJump ? stormName(d.biggestCategoryJump.storm) : ''},
                {label:'BIGGEST COMEBACK',value:d.biggestComeback ? '+'+displayWindspeed(d.biggestComeback.value) : 'N/A',sub:d.biggestComeback ? stormName(d.biggestComeback.storm) : 'after prior weakening'},
                {label:d.typhoonLabel.toUpperCase()+' REGAINERS',value:d.typhoonRegainers,sub:'fell below then regained threshold'}
            ];
            drawMetricGrid(items,18,118,WIDTH-36,394,3);
            fill(COLORS.UI.greyText);
            textAlign(CENTER,TOP);
            textSize(9);
            text('24-hour changes are reconstructed from 6-hour advisory records.',WIDTH/2,516);
        };

        const renderTiming = d=>{
            const namedFormationTicks = d.namedInfos.map(i=>({storm:i.storm,t:i.records.find(r=>r.named).t})).sort((a,b)=>a.t-b.t);
            const latestNamedFormation = namedFormationTicks.length ? namedFormationTicks[namedFormationTicks.length-1] : undefined;
            const items = [
                {label:'FIRST TROPICAL CYCLONE',value:d.firstTC ? fmtDate(d.basin,d.firstTC.t) : 'N/A',sub:d.firstTC ? stormName(d.firstTC.storm) : ''},
                {label:'FIRST NAMED STORM',value:d.firstNamed ? fmtDate(d.basin,d.firstNamed.t) : 'N/A',sub:d.firstNamed ? stormName(d.firstNamed.storm) : ''},
                {label:'FIRST '+d.typhoonLabel.toUpperCase(),value:d.firstTyphoon ? fmtDate(d.basin,d.firstTyphoon.t) : 'N/A',sub:d.firstTyphoon ? stormName(d.firstTyphoon.storm) : ''},
                {label:'LAST NAMED ACTIVITY',value:d.lastNamed ? fmtDate(d.basin,d.lastNamed.t) : 'N/A',sub:d.lastNamed ? stormName(d.lastNamed.storm) : ''},
                {label:'LAST '+d.typhoonLabel.toUpperCase()+' ACTIVITY',value:d.lastTyphoon ? fmtDate(d.basin,d.lastTyphoon.t) : 'N/A',sub:d.lastTyphoon ? stormName(d.lastTyphoon.storm) : ''},
                {label:'LATEST NAMED FORMATION',value:latestNamedFormation ? fmtDate(d.basin,latestNamedFormation.t) : 'N/A',sub:latestNamedFormation ? stormName(latestNamedFormation.storm) : ''},
                {label:'EARLIEST-FORMING TC',value:d.earliestForming ? fmtDate(d.basin,d.earliestForming.firstTick) : 'N/A',sub:d.earliestForming ? stormName(d.earliestForming.storm) : ''},
                {label:'LATEST-FORMING TC',value:d.latestForming ? fmtDate(d.basin,d.latestForming.firstTick) : 'N/A',sub:d.latestForming ? stormName(d.latestForming.storm) : ''},
                {label:'LONGEST-LIVED TC',value:d.longest ? fmtDuration(d.longest.activeHours) : 'N/A',sub:d.longest ? stormName(d.longest.storm) : ''},
                {label:'SHORTEST-LIVED NAMED',value:d.shortestNamed ? fmtDuration(d.shortestNamed.namedHours) : 'N/A',sub:d.shortestNamed ? stormName(d.shortestNamed.storm) : ''},
                {label:'LONGEST NAMED-STORM QUIET GAP',value:d.quietGap ? fmtDuration(d.quietGap.hours) : 'N/A',sub:d.quietGap ? fmtDate(d.basin,d.quietGap.start)+' → '+fmtDate(d.basin,d.quietGap.end) : ''},
                {label:'BUSIEST 30-DAY WINDOW',value:d.busiest30 ? d.busiest30.count+' named storms' : 'N/A',sub:d.busiest30 ? fmtDate(d.basin,d.busiest30.start)+' → '+fmtDate(d.basin,d.busiest30.end) : ''},
                {label:'DAYS WITH ACTIVE TC',value:d.activeDays},
                {label:'PEAK SIMULTANEOUS TCs',value:d.peakSimultaneous,sub:fmtDate(d.basin,d.peakSimTick)},
                {label:'TOTAL TC ACTIVITY',value:fmtDuration(d.totalStormHours),sub:'sum of individual storm time'}
            ];
            drawMetricGrid(items,18,118,WIDTH-36,394,3);
        };

        const renderImpacts = d=>{
            const lf = d.strongestLandfall;
            const mostDam = d.mostDamaging;
            const dead = d.deadliest;
            const mostLf = d.mostLandfalls;
            const items = [
                {label:'TOTAL DAMAGE',value:damageDisplayNumber(d.stats.damage)},
                {label:'TOTAL DEATHS',value:d.stats.deaths},
                {label:'TOTAL LANDFALLS',value:d.stats.landfalls},
                {label:'STRONGEST SAMPLED LANDFALL',value:lf ? displayWindspeed(lf.d.windSpeed)+' • '+lf.d.pressure+' hPa' : 'N/A',sub:lf ? stormName(lf.storm)+' • '+fmtDate(d.basin,lf.t) : ''},
                {label:'MOST DAMAGING STORM',value:mostDam ? damageDisplayNumber(mostDam.storm.damage) : 'N/A',sub:mostDam ? stormName(mostDam.storm) : ''},
                {label:'DEADLIEST STORM',value:dead ? dead.storm.deaths+' deaths' : 'N/A',sub:dead ? stormName(dead.storm) : ''},
                {label:'AVG DAMAGE / LANDFALL',value:d.stats.landfalls ? damageDisplayNumber(d.stats.damage/d.stats.landfalls) : 'N/A'},
                {label:'AVG DEATHS / LANDFALL',value:d.stats.landfalls ? roundTo(d.stats.deaths/d.stats.landfalls,1) : 'N/A'},
                {label:'MOST LANDFALLS — STORM',value:mostLf ? mostLf.storm.landfalls : 'N/A',sub:mostLf ? stormName(mostLf.storm) : ''},
                {label:'STORMS CAUSING DAMAGE',value:d.stormsWithDamage},
                {label:'STORMS CAUSING DEATHS',value:d.stormsWithDeaths},
                {label:'LANDFALLING STORMS*',value:d.landfallingStorms},
                {label:'DAMAGE / NAMED STORM',value:d.namedInfos.length ? damageDisplayNumber(d.stats.damage/d.namedInfos.length) : 'N/A'},
                {label:'DEATHS / NAMED STORM',value:d.namedInfos.length ? roundTo(d.stats.deaths/d.namedInfos.length,1) : 'N/A'},
                {label:'SAMPLED LANDFALL EVENTS*',value:d.months.reduce((a,m)=>a+m.landfalls,0)}
            ];
            drawMetricGrid(items,18,118,WIDTH-36,394,3);
            fill(COLORS.UI.greyText);
            textAlign(CENTER,TOP);
            textSize(9);
            text('* Landfall timing/intensity is inferred from 6-hour advisory positions; official season landfall totals above use the simulator\'s native counter.',WIDTH/2,516);
        };

        const renderMonthly = d=>{
            const x=20, y=120, w=WIDTH-40;
            const headerH=28, rowH=29;
            const cols = [
                ['MONTH',0.09],['TCs',0.10],['NAMED',0.11],['ACE',0.16],['PEAK WIND',0.20],['MIN PRESSURE',0.20],['LF*',0.14]
            ];
            fill(COLORS.UI.buttonBox);
            noStroke();
            rect(x,y,w,headerH+rowH*12,6);
            fill(COLORS.UI.text);
            textStyle(BOLD);
            textSize(10);
            let cx=x;
            for(const [label,frac] of cols){
                const cw=w*frac;
                textAlign(CENTER,CENTER);
                text(label,cx+cw/2,y+headerH/2);
                cx+=cw;
            }
            textStyle(NORMAL);
            for(let r=0;r<12;r++){
                const m=d.months[r];
                const ry=y+headerH+r*rowH;
                if(r%2===0){
                    fill(COLORS.UI.box);
                    noStroke();
                    rect(x,ry,w,rowH);
                }
                const vals = [
                    m.label,
                    m.systems.size,
                    m.named.size,
                    fmtACE(m.ace),
                    m.peakWind===undefined ? '—' : displayWindspeed(m.peakWind),
                    m.minPressure===undefined ? '—' : m.minPressure+' hPa',
                    m.landfalls
                ];
                cx=x;
                for(let c=0;c<cols.length;c++){
                    const cw=w*cols[c][1];
                    fill(COLORS.UI.text);
                    textAlign(CENTER,CENTER);
                    textStyle(c===0 ? BOLD : NORMAL);
                    textSize(11);
                    const cellText = clampText(vals[c],cw-8,11,8);
                    text(cellText,cx+cw/2,ry+rowH/2);
                    cx+=cw;
                }
            }
            textStyle(NORMAL);
            fill(COLORS.UI.greyText);
            textAlign(CENTER,TOP);
            textSize(9);
            text('Monthly ACE and intensity are reconstructed from 6-hour in-basin tropical/subtropical advisories. LF* = sampled ocean-to-land crossings.',WIDTH/2,y+headerH+rowH*12+8);
        };

        const detailsPanel = new UI(null,0,0,WIDTH,HEIGHT,function(s){
            fill(COLORS.UI.box);
            noStroke();
            s.fullRect();

            fill(COLORS.UI.text);
            textAlign(CENTER,TOP);
            textStyle(BOLD);
            textSize(28);
            text('SEASON DETAILS',WIDTH/2,14);
            textStyle(NORMAL);
            textSize(17);
            text(targetSeason===undefined ? 'No season selected' : seasonName(targetSeason),WIDTH/2,48);

            const d = getData();
            if(!d){
                textSize(20);
                text('Loading season data…',WIDTH/2,HEIGHT/2);
                return;
            }

            if(activeTab===0) renderSummary(d);
            else if(activeTab===1) renderIntensity(d);
            else if(activeTab===2) renderTiming(d);
            else if(activeTab===3) renderImpacts(d);
            else renderMonthly(d);
        },undefined,false);

        detailsPanel.append(false,14,14,92,28,s=>{
            s.button('← Back',true,15);
        },()=>{
            detailsPanel.hide();
            primaryWrapper.show();
            UI.updateMouseOver();
        });

        const tabW = 132;
        const tabGap = 6;
        const totalTabW = TABS.length*tabW+(TABS.length-1)*tabGap;
        const tabStart = (WIDTH-totalTabW)/2;
        for(let i=0;i<TABS.length;i++){
            const b = detailsPanel.append(false,tabStart+i*(tabW+tabGap),78,tabW,27,function(s){
                s.button(TABS[i],true,14);
                if(activeTab===i){
                    fill(COLORS.UI.text);
                    noStroke();
                    rect(8,this.height-3,this.width-16,2);
                }
            },()=>{
                activeTab=i;
            });
            b.metadata=i;
        }

        const timelineButton = stormInfoPanel.children.find(c=>
            c.renderFunc && c.renderFunc.toString().includes('View Timeline')
        );
        const panelW = stormInfoPanel.width;
        const fullButtonW = panelW-60;
        const buttonGap = 6;
        const halfButtonW = (fullButtonW-buttonGap)/2;
        let detailsButton;

        if(timelineButton){
            timelineButton.renderFunc = function(s){
                const isSeason = stormInfoPanel.target!==undefined && !(stormInfoPanel.target instanceof Storm);
                if(isSeason)
                    this.setBox(30,stormInfoPanel.height-27,halfButtonW,24);
                else
                    this.setBox(30,stormInfoPanel.height-27,fullButtonW,24);
                s.button('View Timeline',true,15);
            };

            detailsButton = stormInfoPanel.append(false,30+halfButtonW+buttonGap,stormInfoPanel.height-27,halfButtonW,24,function(s){
                s.button('Season Details',true,14);
            },()=>{
                const t = stormInfoPanel.target;
                if(t!==undefined && !(t instanceof Storm)){
                    targetSeason = t;
                    activeTab = 0;
                    cacheTarget = undefined;
                    cacheData = undefined;
                    primaryWrapper.hide();
                    detailsPanel.show();
                    UI.updateMouseOver();
                }
            },false);

            const previousInfoRender = stormInfoPanel.renderFunc;
            stormInfoPanel.renderFunc = function(s){
                if(detailsButton)
                    detailsButton.showing = this.showing && this.target!==undefined && !(this.target instanceof Storm);
                return previousInfoRender.call(this,s);
            };
        }else{
            console.warn('Raptor Season Details: View Timeline button not found');
        }

        window.__raptorSeasonDetails = {
            panel: detailsPanel,
            open: season=>{
                if(!(UI.viewBasin instanceof Basin)) return;
                targetSeason = season===undefined ? UI.viewBasin.getSeason(viewTick) : season;
                activeTab = 0;
                cacheTarget = undefined;
                cacheData = undefined;
                primaryWrapper.hide();
                detailsPanel.show();
            },
            close: ()=>{
                detailsPanel.hide();
                primaryWrapper.show();
            },
            get data(){ return getData(); }
        };
    };
})();
// Raptor Mod 0.16.0 UI refinement: split Storm Debug into two readable pages.
// Keeps all diagnostics observational and leaves storm physics untouched.
(function(){
    const dbg = window.__raptorStormDebug;
    if(!dbg){
        console.warn('Raptor storm-debug pages: core debug module not found');
        return;
    }

    const finite = v=>Number.isFinite(Number(v));
    const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
    const pct = (v,d)=>finite(v) ? (Number(v)*100).toFixed(d===undefined?0:d)+'%' : 'N/A';
    const num = (v,d,suffix)=>finite(v) ? Number(v).toFixed(d===undefined?1:d)+(suffix||'') : 'N/A';
    const signed = (v,d,suffix)=>{
        if(!finite(v)) return 'N/A';
        v = Number(v);
        return (v>0?'+':'')+v.toFixed(d===undefined?1:d)+(suffix||'');
    };
    const yesNo = v=>v ? 'YES' : 'NO';
    const pass = v=>v ? '\u2713' : '\u2717';

    const typeName = ty=>{
        if(ty===TROP) return 'Tropical';
        if(ty===SUBTROP) return 'Subtropical';
        if(ty===TROPWAVE) return 'Wave / Remnant';
        if(ty===EXTROP) return 'Extratropical';
        return ''+ty;
    };

    const vecObj = v=>{
        if(!v || !finite(v.x) || !finite(v.y)) return null;
        const x = Number(v.x);
        const y = Number(v.y);
        return {x,y,mag:Math.hypot(x,y),angle:Math.atan2(y,x)};
    };

    const vecText = v=>{
        if(!v) return 'N/A';
        let heading;
        try{ heading = compassHeading(v.angle); }
        catch(e){ heading = (v.angle*180/Math.PI).toFixed(0)+' deg'; }
        return v.mag.toFixed(2)+' u/hr  '+heading;
    };

    const recordAtOrBefore = (storm,targetTick)=>{
        if(!(storm instanceof Storm)) return;
        for(let i=storm.record.length-1;i>=0;i--){
            const t = storm.get_tick_from_record_index(i);
            if(t<=targetTick) return {data:storm.record[i],tick:t};
        }
    };

    const changesSince = (storm,tick,hours,currentPressure,currentWind)=>{
        const old = recordAtOrBefore(storm,tick-hours);
        if(!old) return null;
        return {
            pressure: currentPressure-old.data.pressure,
            wind: currentWind-old.data.windSpeed,
            actualHours: tick-old.tick
        };
    };

    const sampledSurfaceHistory = (storm,sys)=>{
        let landHours = 0;
        let oceanHours = 0;
        let currentLand = false;
        try{ currentLand = !!land.get(sys.coord()); }catch(e){}

        if(storm instanceof Storm){
            for(const d of storm.record){
                let onLand = false;
                try{ onLand = !!land.get(d.coord()); }catch(e){}
                if(onLand) landHours += ADVISORY_TICKS;
                else oceanHours += ADVISORY_TICKS;
            }
            const lastTick = storm.record.length ? storm.get_tick_from_record_index(storm.record.length-1) : storm.birthTime;
            const tail = Math.max(0,sys.basin.tick-lastTick);
            if(currentLand) landHours += tail;
            else oceanHours += tail;
        }

        let streak = 0;
        if(storm instanceof Storm){
            const lastTick = storm.record.length ? storm.get_tick_from_record_index(storm.record.length-1) : storm.birthTime;
            streak += Math.max(0,sys.basin.tick-lastTick);
            for(let i=storm.record.length-1;i>=0;i--){
                let onLand = false;
                try{ onLand = !!land.get(storm.record[i].coord()); }catch(e){}
                if(onLand!==currentLand) break;
                streak += ADVISORY_TICKS;
            }
        }
        return {landHours,oceanHours,currentLand,streak};
    };

    const configuredPacing = tier=>{
        const tuning = window.__raptorIntensityRateTuning;
        let pRate = 1.96;
        let wRate = 5.6;
        if(tuning){
            try{ if(tuning.pressure && finite(tuning.pressure.rate)) pRate = Number(tuning.pressure.rate); }catch(e){}
            try{ if(tuning.wind && finite(tuning.wind.rate)) wRate = Number(tuning.wind.rate); }catch(e){}
        }

        let pTier = 1;
        let pCap = 1.35;
        let wTier = 1;
        if(tier.veryFavorable){ pTier = 0.62/0.56; pCap = 1.75; wTier = 0.09/0.08; }
        if(tier.exceptionalRI){ pTier = 0.72/0.56; pCap = 2.25; wTier = 0.11/0.08; }
        if(tier.eliteRI){ pTier = 0.82/0.56; pCap = 3.00; wTier = 0.13/0.08; }

        const pFactor = pRate/2.8;
        const wFactor = wRate/8.0;
        const appliedPressureGapRate = Math.min(5,pRate*pTier);
        const hourlyPressureCap = pCap*pFactor;
        const appliedWindGapRate = Math.min(15,wRate*wTier);

        let wind24Cap = Math.min(29,20*wFactor);
        if(tier.veryFavorable) wind24Cap = Math.min(29,29*wFactor);
        if(tier.exceptionalRI) wind24Cap = 45*wFactor;
        if(tier.eliteRI) wind24Cap = Math.min(70,60*wFactor);
        return {pRate,wRate,appliedPressureGapRate,hourlyPressureCap,appliedWindGapRate,wind24Cap};
    };

    const previousUIInit = UI.init;
    let page = 0;
    let physicsTab;
    let historyTab;

    UI.init = function(){
        previousUIInit.call(UI);

        // Retire the original all-in-one panel. It is a direct child with these
        // exact dimensions/position in the 0.16.0 core debug module.
        const oldPanel = (primaryWrapper.children || []).find(u=>
            u.relX===8 && u.relY===38 && u.width===635 && u.height===464 && u.renderFunc
        );
        if(oldPanel) oldPanel.hide();

        const panel = primaryWrapper.append(false,8,38,635,464,function(s){
            const active = !!(
                simSettings && simSettings.stormDebugMode &&
                selectedStorm instanceof Storm &&
                selectedStorm.current instanceof ActiveSystem &&
                UI.viewBasin instanceof Basin && UI.viewBasin.viewingPresent()
            );

            if(physicsTab) physicsTab.showing = active;
            if(historyTab) historyTab.showing = active;
            if(!active) return;

            const storm = selectedStorm;
            const sys = storm.current;
            let state = dbg.state.get(sys);
            if(!state){
                state = {tick:sys.basin.tick,sample:dbg.readSample(sys)};
                dbg.state.set(sys,state);
            }
            const sample = state.sample && state.sample.tick===sys.basin.tick ? state.sample : dbg.readSample(sys);
            state.sample = sample;

            const tier = dbg.environmentTier(sys,sample);
            const recovery = sys.basin.actMode===SIM_MODE_NORMAL ? dbg.recoveryInfo(sys,sample) : null;
            const targets = dbg.normalTargets(sys,sample,recovery);
            const limiter = dbg.likelyLimiter(sys,sample,targets);
            const pacing = configuredPacing(tier);
            const coord = sys.coord();
            const d1 = state.hourDelta || {};
            const d6 = changesSince(storm,sys.basin.tick,6,sys.pressure,sys.windSpeed);
            const d12 = changesSince(storm,sys.basin.tick,12,sys.pressure,sys.windSpeed);
            const d24 = changesSince(storm,sys.basin.tick,24,sys.pressure,sys.windSpeed);
            const surfaces = sampledSurfaceHistory(storm,sys);
            const ulWeight = Math.sqrt(clamp(sys.depth,0,1));
            const llWeight = 1-ulWeight;
            const modeName = SIMULATION_MODES[sys.basin.actMode] || ('Mode '+sys.basin.actMode);
            const name = storm.getFullNameByTick(sys.basin.tick) || storm.getFullNameByTick('peak') || 'Unnamed system';

            let latTxt = finite(coord.latitude) ? Math.abs(coord.latitude).toFixed(2)+'\u00b0'+(coord.latitude>=0?'N':'S') : 'N/A';
            let lonTxt = finite(coord.longitude) ? Math.abs(coord.longitude).toFixed(2)+'\u00b0'+(coord.longitude>=0?'E':'W') : 'N/A';

            const scale = (()=>{
                try{ return sys.basin.getScale(land.getSubBasin(coord)); }
                catch(e){ return null; }
            })();
            const className = scale ? scale.getClassificationName(sys) : 'N/A';
            let peakClass = 'N/A';
            if(storm.windPeak){
                try{
                    const ps = sys.basin.getScale(land.getSubBasin(storm.windPeak.coord()));
                    peakClass = ps.getClassificationName(storm.windPeak);
                }catch(e){}
            }

            push();
            fill(0,0,0,218);
            stroke(255,255,255,105);
            strokeWeight(1);
            s.fullRect();
            noStroke();
            textFont('monospace');
            textAlign(LEFT,TOP);

            fill(248);
            textStyle(BOLD);
            textSize(14);
            text('STORM DEBUG  |  '+name,10,7);
            textStyle(NORMAL);
            textSize(9);
            fill(205);
            text(modeName+'  |  Tick '+sys.basin.tick+'  |  '+latTxt+' '+lonTxt+'  |  Page '+(page+1)+'/2',10,26);

            stroke(255,255,255,70);
            line(10,73,this.width-10,73);
            noStroke();

            const colW = 292;
            const leftX = 10;
            const rightX = 329;
            const startY = 82;
            const lineH = 12;

            const section = (x,y,title)=>{
                fill(250);
                textStyle(BOLD);
                textSize(10);
                text(title,x,y);
                textStyle(NORMAL);
                textSize(9);
                return y+lineH;
            };
            const row = (x,y,label,value)=>{
                fill(180,190,205);
                textAlign(LEFT,TOP);
                text(label,x,y);
                fill(248);
                textAlign(RIGHT,TOP);
                text(value,x+colW,y);
                return y+lineH;
            };
            const compact = (x,y,textValue)=>{
                fill(238);
                textAlign(LEFT,TOP);
                text(textValue,x,y);
                return y+lineH;
            };

            if(page===0){
                let yL = startY;
                yL = section(leftX,yL,'CORE / INTENSITY');
                yL = row(leftX,yL,'Type / class',typeName(sys.type)+' / '+className);
                yL = row(leftX,yL,'Wind',num(sys.windSpeed,1,' kt'));
                yL = row(leftX,yL,'Wind target',targets ? num(targets.wind,1,' kt') : 'N/A outside Normal');
                yL = row(leftX,yL,'Wind target gap',targets ? signed(targets.wind-sys.windSpeed,1,' kt') : 'N/A');
                yL = row(leftX,yL,'Pressure',num(sys.pressure,1,' hPa'));
                yL = row(leftX,yL,'Pressure target',targets ? num(targets.pressure,1,' hPa') : 'N/A outside Normal');
                yL = row(leftX,yL,'Pressure target gap',targets ? signed(targets.pressure-sys.pressure,1,' hPa') : 'N/A');
                yL = row(leftX,yL,'Ocean potential',targets ? num(targets.oceanPotential,1,' hPa') : 'N/A');
                yL = row(leftX,yL,'Organization',pct(sys.organization,1));
                yL = row(leftX,yL,'Depth',pct(sys.depth,1));
                yL = row(leftX,yL,'Lower warm core',pct(sys.lowerWarmCore,1));
                yL = row(leftX,yL,'Upper warm core',pct(sys.upperWarmCore,1));

                yL += 3;
                yL = section(leftX,yL,'PACING / RECENT CHANGE');
                yL = row(leftX,yL,'Configured pressure',pacing.pRate.toFixed(2)+'% gap/hr');
                yL = row(leftX,yL,'Configured wind',pacing.wRate.toFixed(1)+'% gap/hr');
                yL = row(leftX,yL,'Applied pressure',pacing.appliedPressureGapRate.toFixed(2)+'% gap/hr');
                yL = row(leftX,yL,'Applied wind',pacing.appliedWindGapRate.toFixed(1)+'% gap/hr');
                yL = row(leftX,yL,'Hourly pressure cap',pacing.hourlyPressureCap.toFixed(2)+' hPa/hr');
                yL = row(leftX,yL,'24h wind gain cap',pacing.wind24Cap.toFixed(1)+' kt/24h');
                yL = row(leftX,yL,'Last hour pressure',signed(d1.pressure,2,' hPa'));
                yL = row(leftX,yL,'Last hour wind',signed(d1.wind,2,' kt'));
                yL = row(leftX,yL,'6h pressure / wind',d6 ? signed(d6.pressure,1,' hPa')+' / '+signed(d6.wind,1,' kt') : 'N/A');
                yL = row(leftX,yL,'12h pressure / wind',d12 ? signed(d12.pressure,1,' hPa')+' / '+signed(d12.wind,1,' kt') : 'N/A');
                yL = row(leftX,yL,'24h pressure / wind',d24 ? signed(d24.pressure,1,' hPa')+' / '+signed(d24.wind,1,' kt') : 'N/A');
                yL = row(leftX,yL,'Organization change',signed(d1.organization*100,2,' pp/hr'));
                yL = row(leftX,yL,'LWC / UWC change',signed(d1.lowerWarmCore*100,2,' pp')+' / '+signed(d1.upperWarmCore*100,2,' pp'));
                yL = row(leftX,yL,'Depth change',signed(d1.depth*100,2,' pp/hr'));

                let yR = startY;
                yR = section(rightX,yR,'ENVIRONMENT');
                yR = row(rightX,yR,'SST',num(sample && sample.SST,2,' \u00b0C'));
                yR = row(rightX,yR,'Moisture',pct(sample && sample.moisture,1));
                yR = row(rightX,yR,'Environmental shear',num(sample && sample.envShear,2,' u/hr'));
                yR = row(rightX,yR,'Interaction shear',num(sample && sample.interactionShear,2,' u/hr'));
                yR = row(rightX,yR,'Total shear',num(sample && sample.totalShear,2,' u/hr'));
                yR = row(rightX,yR,'Surface',sample && sample.onLand ? 'LAND' : 'OCEAN');
                yR = row(rightX,yR,'Land value',num(sample && sample.landValue,3));
                yR = row(rightX,yR,'Jet relative',num(sample && sample.jetRelative,1,' px'));
                yR = row(rightX,yR,'Likely limiter',limiter+' [heuristic]');

                yR += 3;
                yR = section(rightX,yR,'RI / RECOVERY');
                if(sys.basin.actMode===SIM_MODE_NORMAL){
                    yR = row(rightX,yR,'Very favorable',yesNo(tier.veryFavorable));
                    yR = row(rightX,yR,'RI eligible',yesNo(tier.exceptionalRI));
                    yR = row(rightX,yR,'Elite RI',yesNo(tier.eliteRI));
                    yR = compact(rightX,yR,'RI gates: SST '+pass(sample.SST>=28)+'  Moist '+pass(sample.moisture>=0.60)+'  Shear '+pass(sample.totalShear<=2.5));
                    yR = compact(rightX,yR,'          LWC '+pass(sys.lowerWarmCore>=0.82)+'  UWC '+pass(sys.upperWarmCore>=0.72)+'  Org '+pass(sys.organization>=0.62));
                    yR = row(rightX,yR,'Recovery active',recovery ? yesNo(recovery.active) : 'N/A');
                    yR = row(rightX,yR,'Recovery flavor',recovery ? (recovery.established?'Established TC':recovery.remnant?'Remnant':'None') : 'N/A');
                    yR = row(rightX,yR,'Recovery favorability',recovery ? pct(recovery.favorability,1) : 'N/A');
                    yR = row(rightX,yR,'Recent peak wind',recovery ? num(recovery.recentPeakWind,1,' kt') : 'N/A');
                    yR = row(rightX,yR,'72h memory remaining',recovery ? num(recovery.memoryRemaining,0,' h') : 'N/A');
                }else{
                    yR = compact(rightX,yR,'RI / recovery gates: N/A outside Normal mode');
                }
                yR = row(rightX,yR,'Weak-low timer',num(sys.weakSystemHours || 0,0,' / 18 h'));
            }else{
                let yL = startY;
                yL = section(leftX,yL,'STEERING / INTERACTION');
                yL = row(leftX,yL,'Low-level steering',vecText(sample && sample.LL));
                yL = row(leftX,yL,'Upper-level steering',vecText(sample && sample.UL));
                yL = row(leftX,yL,'LL / UL blend',pct(llWeight,1)+' / '+pct(ulWeight,1));
                yL = row(leftX,yL,'Final steering',vecText(sample && sample.finalSteering));
                yL = row(leftX,yL,'Fujiwhara vector',vecText(sample && sample.fuji));
                yL = row(leftX,yL,'Shear vector',vecText(sample && sample.shearVec));
                yL = row(leftX,yL,'Interaction shear',num(sample && sample.interactionShear,2,' u/hr'));
                yL = row(leftX,yL,'Interaction kill',yesNo(!!(sys.interaction && sys.interaction.kill)));

                yL += 3;
                yL = section(leftX,yL,'POSITION / LIFECYCLE');
                yL = row(leftX,yL,'Latitude / longitude',latTxt+' / '+lonTxt);
                yL = row(leftX,yL,'Storm age',num(sys.basin.tick-storm.birthTime,0,' h'));
                yL = row(leftX,yL,'Tropical age',storm.formationTime===undefined ? 'N/A' : num(sys.basin.tick-storm.formationTime,0,' h'));
                yL = row(leftX,yL,'Birth / formation tick',storm.birthTime+' / '+(storm.formationTime===undefined?'N/A':storm.formationTime));
                yL = row(leftX,yL,'TC / in-basin TC',yesNo(storm.TC)+' / '+yesNo(storm.inBasinTC));
                yL = row(leftX,yL,'Current surface',surfaces.currentLand ? 'LAND' : 'OCEAN');
                yL = row(leftX,yL,'Current surface streak',num(surfaces.streak,0,' h'));
                yL = row(leftX,yL,'Sampled ocean / land',num(surfaces.oceanHours,0,' h')+' / '+num(surfaces.landHours,0,' h'));
                yL = row(leftX,yL,'Weak-low timer',num(sys.weakSystemHours || 0,0,' / 18 h'));
                yL = row(leftX,yL,'System kill flag',yesNo(!!sys.kill));

                let yR = startY;
                yR = section(rightX,yR,'HISTORY / IMPACT');
                yR = row(rightX,yR,'Current type / class',typeName(sys.type)+' / '+className);
                yR = row(rightX,yR,'Peak wind / class',storm.windPeak ? num(storm.windPeak.windSpeed,0,' kt')+' / '+peakClass : 'N/A');
                yR = row(rightX,yR,'Peak pressure',storm.peak ? num(storm.peak.pressure,0,' hPa') : 'N/A');
                const aceNow = (typeof ACE_WIND_THRESHOLD!=='undefined' && typeof ACE_DIVISOR!=='undefined' && tropOrSub(sys.type) && sys.windSpeed>=ACE_WIND_THRESHOLD) ? Math.pow(sys.windSpeed,2)/ACE_DIVISOR : 0;
                yR = row(rightX,yR,'ACE total',num(storm.ACE,4));
                yR = row(rightX,yR,'Next advisory ACE',num(aceNow,4));
                yR = row(rightX,yR,'Damage',typeof damageDisplayNumber==='function' ? damageDisplayNumber(storm.damage) : ''+storm.damage);
                yR = row(rightX,yR,'Deaths',storm.deaths);
                yR = row(rightX,yR,'Landfalls',storm.landfalls);
                yR = row(rightX,yR,'Exit tick',storm.exitTime===undefined?'N/A':storm.exitTime);
                yR = row(rightX,yR,'Dissipation tick',storm.dissipationTime===undefined?'N/A':storm.dissipationTime);

                yR += 3;
                yR = section(rightX,yR,'CURRENT INTERNAL STATE');
                yR = row(rightX,yR,'Pressure / wind',num(sys.pressure,1,' hPa')+' / '+num(sys.windSpeed,1,' kt'));
                yR = row(rightX,yR,'Organization / depth',pct(sys.organization,1)+' / '+pct(sys.depth,1));
                yR = row(rightX,yR,'Lower / upper warm core',pct(sys.lowerWarmCore,1)+' / '+pct(sys.upperWarmCore,1));
                yR = row(rightX,yR,'SST / moisture',num(sample && sample.SST,2,' \u00b0C')+' / '+pct(sample && sample.moisture,1));
                yR = row(rightX,yR,'Total shear',num(sample && sample.totalShear,2,' u/hr'));
                yR = row(rightX,yR,'Limiter',limiter+' [heuristic]');
            }

            pop();
        });

        const tabRender = function(label,index){
            return function(s){
                const active = !!(
                    simSettings && simSettings.stormDebugMode &&
                    selectedStorm instanceof Storm && selectedStorm.current instanceof ActiveSystem &&
                    UI.viewBasin instanceof Basin && UI.viewBasin.viewingPresent()
                );
                if(!active) return;
                noStroke();
                fill(page===index ? 65 : 28, page===index ? 92 : 34, page===index ? 130 : 42, 235);
                s.fullRect();
                stroke(255,255,255,page===index?150:65);
                noFill();
                s.fullRect();
                noStroke();
                fill(248);
                textFont('monospace');
                textStyle(page===index?BOLD:NORMAL);
                textAlign(CENTER,CENTER);
                textSize(9);
                text(label,this.width/2,this.height/2);
                textStyle(NORMAL);
            };
        };

        physicsTab = panel.append(false,10,43,145,24,tabRender('PHYSICS',0),function(){ page=0; });
        historyTab = panel.append(false,162,43,190,24,tabRender('STEERING / HISTORY',1),function(){ page=1; });
        physicsTab.hide();
        historyTab.hide();
    };

    window.__raptorStormDebugPages = {
        build: '0.16.0',
        pages: ['Physics','Steering / History'],
        get page(){ return page; },
        set page(v){ page = Number(v)===1 ? 1 : 0; }
    };
})();

// Raptor Mod 0.7.0: season overview and timeline polish.
// Upgrades the existing season statistics panel and season timeline without
// replacing storm intensity graphs or changing any simulation physics.
(function(){
    const originalUIInit = UI.init;

    UI.init = function(){
        originalUIInit.call(UI);

        const originalInfoRender = stormInfoPanel.renderFunc;

        // --- Cleaner season overview panel ---
        stormInfoPanel.renderFunc = function(s){
            const target = this.target;
            if(target instanceof Storm || target === undefined){
                return originalInfoRender.call(this,s);
            }

            fill(COLORS.UI.box);
            noStroke();
            s.fullRect();

            fill(COLORS.UI.text);
            textStyle(NORMAL);
            textAlign(CENTER,TOP);
            textSize(11);
            text('SEASON OVERVIEW',this.width/2,10);
            textSize(24);
            text(seasonName(target),this.width/2,25);

            const season = UI.viewBasin.fetchSeason(target);
            if(!(season instanceof Season)){
                textSize(15);
                text('Season data unavailable',this.width/2,72);
                return;
            }

            const stats = season.stats(UI.viewBasin.mainSubBasin);
            const counters = stats.classificationCounters;
            const scale = UI.viewBasin.getScale(UI.viewBasin.mainSubBasin);
            const activityRows = Array.from(scale.statDisplay());

            const pad = 12;
            const cardW = this.width-pad*2;
            let y = 62;

            // Activity card.
            fill(COLORS.UI.buttonBox);
            noStroke();
            const activityH = 26 + activityRows.length*21;
            rect(pad,y,cardW,activityH,5);

            fill(COLORS.UI.text);
            textAlign(LEFT,TOP);
            textSize(11);
            text('ACTIVITY',pad+10,y+8);
            let rowY = y+27;
            textSize(14);
            for(const {statName,cNumber} of activityRows){
                textAlign(LEFT,CENTER);
                text(statName,pad+10,rowY+7);
                textAlign(RIGHT,CENTER);
                text(counters[cNumber] || 0,pad+cardW-10,rowY+7);
                rowY += 21;
            }
            y += activityH+8;

            // Four quick season metrics in a 2x2 grid.
            const gap = 6;
            const metricW = (cardW-gap)/2;
            const metricH = 48;
            const metrics = [
                ['TOTAL ACE',stats.ACE],
                ['LANDFALLS',stats.landfalls],
                ['DEATHS',stats.deaths],
                ['DAMAGE',damageDisplayNumber(stats.damage)]
            ];
            for(let i=0;i<metrics.length;i++){
                const col = i%2;
                const row = Math.floor(i/2);
                const x = pad+col*(metricW+gap);
                const my = y+row*(metricH+gap);
                fill(COLORS.UI.buttonBox);
                rect(x,my,metricW,metricH,5);
                fill(COLORS.UI.text);
                textAlign(CENTER,TOP);
                textSize(10);
                text(metrics[i][0],x+metricW/2,my+6);
                textSize(16);
                text(metrics[i][1],x+metricW/2,my+23);
            }
            y += metricH*2+gap+8;

            // Most intense storm card.
            const availableBottom = this.height-62;
            const intenseH = Math.max(66,availableBottom-y);
            fill(COLORS.UI.buttonBox);
            rect(pad,y,cardW,intenseH,5);
            fill(COLORS.UI.text);
            textAlign(LEFT,TOP);
            textSize(10);
            text('MOST INTENSE',pad+10,y+8);

            if(stats.most_intense){
                const strongest = stats.most_intense.fetch();
                if(strongest){
                    textSize(17);
                    text(strongest.getNameByTick(-1),pad+10,y+25);
                    textSize(13);
                    const p = strongest.peak ? strongest.peak.pressure + ' hPa' : 'N/A';
                    const w = strongest.windPeak ? displayWindspeed(strongest.windPeak.windSpeed) : 'N/A';
                    text(p + '  •  ' + w,pad+10,y+48);
                }
            }else{
                textSize(15);
                text('N/A',pad+10,y+29);
            }
        };

        // Give the existing View Timeline button a proper button surface.
        const timelineButton = stormInfoPanel.children.find(c=>
            c.renderFunc && c.renderFunc.toString().includes('View Timeline')
        );
        if(timelineButton){
            timelineButton.renderFunc = function(s){
                s.button('View Timeline',true,15);
            };
        }

        // Find the existing timeline box created by ui.js. We keep its own
        // back arrow and active-state machinery, then replace only season view.
        const walk = (node,pred)=>{
            if(pred(node)) return node;
            for(const child of node.children || []){
                const found = walk(child,pred);
                if(found) return found;
            }
        };
        let timelineBox;
        for(const root of UI.elements){
            timelineBox = walk(root,u=>
                u.renderFunc && u.renderFunc.toString().includes("Timeline of '")
            );
            if(timelineBox) break;
        }
        // Fallback for browsers whose Function#toString formatting differs.
        if(!timelineBox){
            for(const root of UI.elements){
                timelineBox = walk(root,u=>
                    u.width === WIDTH && u.height > 250 && u.height < HEIGHT &&
                    u.children && u.children.some(c=>c.width===27 && c.height===u.height)
                );
                if(timelineBox) break;
            }
        }
        if(!timelineBox){
            console.warn('Raptor season overview: timeline box not found');
            return;
        }

        const originalTimelineRender = timelineBox.renderFunc;
        const originalTimelineClick = timelineBox.clickFunc;
        const ROW_HEIGHT = 22;
        const HEADER_HEIGHT = 64;
        const FOOTER_HEIGHT = 28;
        const LABEL_WIDTH = 150;
        const LEFT = 12;
        const RIGHT = 34;
        let scrollOffset = 0;
        let cacheTarget;
        let cacheTick = -1;
        let rows = [];
        let seasonStartTick = 0;
        let seasonEndTick = 1;
        let monthTicks = [];
        let monthNames = [];

        const buildSeason = target=>{
            rows = [];
            scrollOffset = 0;
            cacheTarget = target;
            cacheTick = UI.viewBasin.tick;

            const basin = UI.viewBasin;
            const season = basin.fetchSeason(target);
            if(!(season instanceof Season)) return;

            // Northern seasons are Jan-Dec. Southern seasons are Jul-Jun and
            // are named for the year in which they end (e.g. 2026-27 => 2027).
            let startMoment;
            if(basin.SHem)
                startMoment = moment.utc([target-1,6,1]);
            else
                startMoment = moment.utc([target,0,1]);
            let endMoment = startMoment.clone().add(12,'months');
            seasonStartTick = basin.tickFromMoment(startMoment.clone());
            seasonEndTick = basin.tickFromMoment(endMoment.clone());

            monthTicks = [];
            monthNames = [];
            const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            for(let i=0;i<=12;i++){
                const m = startMoment.clone().add(i,'months');
                monthTicks.push(basin.tickFromMoment(m));
                if(i<12) monthNames.push(monthLabels[m.month()]);
            }

            const scale = basin.getScale(basin.mainSubBasin);
            const storms = [];
            for(const sys of season.forSystems()){
                if(sys instanceof Storm && sys.inBasinTC)
                    storms.push(sys);
            }
            storms.sort((a,b)=>(a.enterTime || a.birthTime)-(b.enterTime || b.birthTime));

            for(const storm of storms){
                const segments = [];
                let activeSeg;
                const firstRecordTick = ceil(storm.birthTime/ADVISORY_TICKS)*ADVISORY_TICKS;
                for(let q=0;q<storm.record.length;q++){
                    const rt = firstRecordTick+q*ADVISORY_TICKS;
                    if(rt < seasonStartTick || rt > seasonEndTick) continue;
                    const d = storm.record[q];
                    if(tropOrSub(d.type) && land.inBasin(d.coord())){
                        const cat = scale.get(d);
                        const fullyTrop = d.type===TROP;
                        if(!activeSeg || activeSeg.cat!==cat || activeSeg.fullyTrop!==fullyTrop){
                            activeSeg = {startTick:rt,endTick:rt,cat,fullyTrop};
                            segments.push(activeSeg);
                        }else{
                            activeSeg.endTick = rt;
                        }
                    }else{
                        activeSeg = undefined;
                    }
                }
                if(!segments.length) continue;

                const label = storm.getNameByTick(-2) || storm.getFullNameByTick('peak') || 'Unnamed';
                rows.push({storm,label,segments});
            }
        };

        const rowAtPointer = function(){
            const mx = getMouseX()-timelineBox.getX();
            const my = getMouseY()-timelineBox.getY();
            if(mx<LEFT || mx>=timelineBox.width-RIGHT || my<HEADER_HEIGHT || my>=timelineBox.height-FOOTER_HEIGHT)
                return;
            const index = Math.floor((my-HEADER_HEIGHT+scrollOffset)/ROW_HEIGHT);
            if(index>=0 && index<rows.length) return rows[index];
        };

        timelineBox.renderFunc = function(s){
            const target = stormInfoPanel.target;
            if(target instanceof Storm || target===undefined)
                return originalTimelineRender.call(this,s);

            if(target!==cacheTarget ||
                (UI.viewBasin.tick!==cacheTick && UI.viewBasin.getSeason(UI.viewBasin.tick)===target))
                buildSeason(target);

            fill(COLORS.UI.box);
            noStroke();
            s.fullRect();

            fill(COLORS.UI.text);
            textStyle(NORMAL);
            textAlign(CENTER,TOP);
            textSize(22);
            text('Timeline of ' + seasonName(target),this.width/2,10);
            textSize(11);
            text(rows.length + ' storm' + (rows.length===1?'':'s') + '  •  wheel to scroll  •  click a storm for its intensity graph',this.width/2,38);

            const plotLeft = LEFT+LABEL_WIDTH;
            const plotRight = this.width-RIGHT;
            const bodyTop = HEADER_HEIGHT;
            const bodyBottom = this.height-FOOTER_HEIGHT;
            const bodyHeight = bodyBottom-bodyTop;
            const maxScroll = Math.max(0,rows.length*ROW_HEIGHT-bodyHeight);
            scrollOffset = constrain(scrollOffset,0,maxScroll);

            // Clip the scrollable storm rows to the timeline body.
            const ctx = drawingContext;
            ctx.save();
            ctx.beginPath();
            ctx.rect(LEFT,bodyTop,plotRight-LEFT,bodyHeight);
            ctx.clip();

            // Month bands and grid.
            for(let i=0;i<12;i++){
                const x0 = map(monthTicks[i],seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                const x1 = map(monthTicks[i+1],seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                if(i%2===0){
                    fill(COLORS.UI.buttonBox);
                    noStroke();
                    rect(x0,bodyTop,x1-x0,bodyHeight);
                }
                stroke(COLORS.UI.greyText);
                strokeWeight(1);
                line(x0,bodyTop,x0,bodyBottom);
            }
            stroke(COLORS.UI.greyText);
            line(plotRight,bodyTop,plotRight,bodyBottom);

            // Current simulation-time marker when it falls within this season.
            if(viewTick>=seasonStartTick && viewTick<=seasonEndTick){
                const nowX = map(viewTick,seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                stroke(COLORS.UI.text);
                strokeWeight(2);
                line(nowX,bodyTop,nowX,bodyBottom);
                strokeWeight(1);
            }

            const hovered = rowAtPointer();
            const scale = UI.viewBasin.getScale(UI.viewBasin.mainSubBasin);
            for(let i=0;i<rows.length;i++){
                const row = rows[i];
                const y = bodyTop+i*ROW_HEIGHT-scrollOffset;
                if(y+ROW_HEIGHT<bodyTop || y>bodyBottom) continue;

                if(row===hovered){
                    fill(COLORS.UI.buttonHover);
                    noStroke();
                    rect(LEFT,y,plotRight-LEFT,ROW_HEIGHT);
                }

                // Storm label stays in a dedicated left column.
                fill(COLORS.UI.text);
                noStroke();
                textAlign(LEFT,CENTER);
                textSize(12);
                let label = row.label;
                while(textWidth(label)>LABEL_WIDTH-15 && label.length>4)
                    label = label.slice(0,-2)+'…';
                text(label,LEFT+7,y+ROW_HEIGHT/2);

                // Draw intensity-colored segments at advisory resolution.
                for(const seg of row.segments){
                    const x0 = map(seg.startTick,seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                    const x1 = map(seg.endTick+ADVISORY_TICKS,seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                    fill(scale.getColor(seg.cat,!seg.fullyTrop));
                    noStroke();
                    rect(x0,y+5,Math.max(2,x1-x0),ROW_HEIGHT-10,3);
                }
            }
            ctx.restore();

            // Header month labels are outside the clip so they stay fixed.
            fill(COLORS.UI.text);
            noStroke();
            textAlign(CENTER,BOTTOM);
            textSize(11);
            for(let i=0;i<12;i++){
                const x0 = map(monthTicks[i],seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                const x1 = map(monthTicks[i+1],seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                text(monthNames[i],(x0+x1)/2,HEADER_HEIGHT-4);
            }
            textAlign(LEFT,BOTTOM);
            text('STORM',LEFT+7,HEADER_HEIGHT-4);

            // Scrollbar for active seasons with lots of systems.
            if(maxScroll>0){
                const trackX = this.width-8;
                const thumbH = Math.max(26,bodyHeight*(bodyHeight/(rows.length*ROW_HEIGHT)));
                const thumbY = bodyTop+(bodyHeight-thumbH)*(scrollOffset/maxScroll);
                fill(COLORS.UI.buttonBox);
                rect(trackX,bodyTop,5,bodyHeight);
                fill(COLORS.UI.text);
                rect(trackX,thumbY,5,thumbH);
            }
        };

        timelineBox.clickFunc = function(){
            const target = stormInfoPanel.target;
            if(target instanceof Storm || target===undefined)
                return originalTimelineClick.call(this);
            const row = rowAtPointer();
            if(row)
                stormInfoPanel.target = row.storm;
        };

        // Wheel scrolling only while the season timeline is visible and the
        // pointer is actually over it. Storm intensity graphs keep stock behavior.
        if(window.__raptorSeasonTimelineWheel)
            window.removeEventListener('wheel',window.__raptorSeasonTimelineWheel);
        window.__raptorSeasonTimelineWheel = function(e){
            if(!timelineBox.showing || stormInfoPanel.target instanceof Storm) return;
            const mx = getMouseX();
            const my = getMouseY();
            if(mx<timelineBox.getX() || mx>=timelineBox.getX()+timelineBox.width ||
               my<timelineBox.getY() || my>=timelineBox.getY()+timelineBox.height) return;

            const bodyHeight = timelineBox.height-HEADER_HEIGHT-FOOTER_HEIGHT;
            const maxScroll = Math.max(0,rows.length*ROW_HEIGHT-bodyHeight);
            if(maxScroll<=0) return;
            scrollOffset = constrain(scrollOffset+Math.sign(e.deltaY)*ROW_HEIGHT*2,0,maxScroll);
            e.preventDefault();
        };
        window.addEventListener('wheel',window.__raptorSeasonTimelineWheel,{passive:false});
    };
})();

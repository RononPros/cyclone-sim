// Raptor Mod 0.7.1: season overview and timeline polish.
// Fixes overview text alignment and restores compact multi-storm timeline rows
// while keeping the 0.7.0 interaction/readability improvements.
(function(){
    const originalUIInit = UI.init;

    UI.init = function(){
        originalUIInit.call(UI);

        const originalInfoRender = stormInfoPanel.renderFunc;

        // --- Cleaner season overview panel ---
        stormInfoPanel.renderFunc = function(s){
            const target = this.target;
            if(target instanceof Storm || target === undefined)
                return originalInfoRender.call(this,s);

            push();

            // Never let custom overview text paint outside the actual panel.
            const panelCtx = drawingContext;
            panelCtx.save();
            panelCtx.beginPath();
            panelCtx.rect(0,0,this.width,this.height);
            panelCtx.clip();

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
                panelCtx.restore();
                pop();
                return;
            }

            const stats = season.stats(UI.viewBasin.mainSubBasin);
            const counters = stats.classificationCounters;
            const scale = UI.viewBasin.getScale(UI.viewBasin.mainSubBasin);
            const activityRows = Array.from(scale.statDisplay());

            const pad = 12;
            const cardW = this.width-pad*2;
            let y = 62;

            const fitText = (str,maxWidth,startSize,minSize)=>{
                let size = startSize;
                textSize(size);
                while(size>minSize && textWidth(str)>maxWidth){
                    size--;
                    textSize(size);
                }
                return size;
            };

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
            for(const {statName,cNumber} of activityRows){
                const labelSpace = cardW-64;
                fitText(''+statName,labelSpace,14,10);
                textAlign(LEFT,CENTER);
                text(statName,pad+10,rowY+7);
                textAlign(RIGHT,CENTER);
                textSize(14);
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
                fitText(''+metrics[i][1],metricW-12,16,11);
                text(metrics[i][1],x+metricW/2,my+23);
            }
            y += metricH*2+gap+8;

            // Most intense storm card. Leave the stock Jump To / View Timeline
            // button area untouched at the bottom of the panel.
            const contentBottom = this.height-62;
            const intenseH = Math.max(66,contentBottom-y);
            fill(COLORS.UI.buttonBox);
            rect(pad,y,cardW,intenseH,5);
            fill(COLORS.UI.text);
            textAlign(LEFT,TOP);
            textSize(10);
            text('MOST INTENSE',pad+10,y+8);

            if(stats.most_intense){
                const strongest = stats.most_intense.fetch();
                if(strongest){
                    const stormName = strongest.getNameByTick(-1);
                    fitText(stormName,cardW-20,17,11);
                    textAlign(LEFT,TOP);
                    text(stormName,pad+10,y+25);

                    textSize(13);
                    const p = strongest.peak ? strongest.peak.pressure + ' hPa' : 'N/A';
                    const w = strongest.windPeak ? displayWindspeed(strongest.windPeak.windSpeed) : 'N/A';
                    const summary = p + '  •  ' + w;
                    fitText(summary,cardW-20,13,10);
                    text(summary,pad+10,y+48);
                }
            }else{
                textSize(15);
                text('N/A',pad+10,y+29);
            }

            panelCtx.restore();
            pop();
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

        // IMPORTANT: do not name these LEFT/RIGHT. p5 uses global LEFT/RIGHT
        // constants for textAlign(); shadowing LEFT caused the 0.7.0 overview
        // labels to stay center-aligned and spill outside the panel.
        const ROW_HEIGHT = 18;
        const HEADER_HEIGHT = 62;
        const FOOTER_HEIGHT = 26;
        const TL_LEFT = 48;
        const TL_RIGHT = 34;
        const PACK_GAP = 7;

        let scrollOffset = 0;
        let cacheTarget;
        let cacheTick = -1;
        let parts = [];
        let packedRows = [];
        let seasonStartTick = 0;
        let seasonEndTick = 1;
        let monthTicks = [];
        let monthNames = [];

        const truncateLabel = (label,maxWidth)=>{
            if(maxWidth<=4) return '';
            textSize(11);
            if(textWidth(label)<=maxWidth) return label;
            let out = label;
            while(out.length>2 && textWidth(out+'…')>maxWidth)
                out = out.slice(0,-1);
            return out.length ? out+'…' : '';
        };

        const buildSeason = target=>{
            parts = [];
            packedRows = [];
            scrollOffset = 0;
            cacheTarget = target;
            cacheTick = UI.viewBasin.tick;

            const basin = UI.viewBasin;
            const season = basin.fetchSeason(target);
            if(!(season instanceof Season)) return;

            let startMoment;
            if(basin.SHem)
                startMoment = moment.utc([target-1,6,1]);
            else
                startMoment = moment.utc([target,0,1]);
            const endMoment = startMoment.clone().add(12,'months');
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

            const plotLeft = TL_LEFT;
            const plotRight = timelineBox.width-TL_RIGHT;

            push();
            textSize(11);

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
                const firstTick = segments[0].startTick;
                const lastTick = segments[segments.length-1].endTick + ADVISORY_TICKS;
                const startX = map(firstTick,seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                const endX = map(lastTick,seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                const fullLabelWidth = textWidth(label);
                const visibleLabelWidth = Math.min(fullLabelWidth,Math.max(0,plotRight-endX-4));
                const occupiedStart = startX;
                const occupiedEnd = Math.min(plotRight,endX+4+visibleLabelWidth);

                const part = {
                    storm,
                    label,
                    segments,
                    startX,
                    endX,
                    occupiedStart,
                    occupiedEnd,
                    row:0
                };

                // Restore the useful old behavior: fit multiple non-overlapping
                // storms onto the same row. Labels count as occupied space too.
                let rowIndex = 0;
                while(true){
                    if(!packedRows[rowIndex]) packedRows[rowIndex] = [];
                    let fits = true;
                    for(const other of packedRows[rowIndex]){
                        if(part.occupiedStart < other.occupiedEnd+PACK_GAP &&
                           part.occupiedEnd+PACK_GAP > other.occupiedStart){
                            fits = false;
                            break;
                        }
                    }
                    if(fits) break;
                    rowIndex++;
                }
                part.row = rowIndex;
                packedRows[rowIndex].push(part);
                parts.push(part);
            }

            pop();
        };

        const partAtPointer = function(){
            const mx = getMouseX()-timelineBox.getX();
            const my = getMouseY()-timelineBox.getY();
            const bodyBottom = timelineBox.height-FOOTER_HEIGHT;
            if(mx<TL_LEFT || mx>=timelineBox.width-TL_RIGHT ||
               my<HEADER_HEIGHT || my>=bodyBottom)
                return;

            const rowIndex = Math.floor((my-HEADER_HEIGHT+scrollOffset)/ROW_HEIGHT);
            const row = packedRows[rowIndex];
            if(!row) return;
            for(let i=row.length-1;i>=0;i--){
                const p = row[i];
                if(mx>=p.occupiedStart-2 && mx<=p.occupiedEnd+2)
                    return p;
            }
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
            text('Timeline of ' + seasonName(target),this.width/2,9);
            textSize(11);
            text(parts.length + ' storms  •  ' + packedRows.length + ' packed rows  •  click a storm for its intensity graph',this.width/2,36);

            const plotLeft = TL_LEFT;
            const plotRight = this.width-TL_RIGHT;
            const bodyTop = HEADER_HEIGHT;
            const bodyBottom = this.height-FOOTER_HEIGHT;
            const bodyHeight = bodyBottom-bodyTop;
            const contentHeight = packedRows.length*ROW_HEIGHT;
            const maxScroll = Math.max(0,contentHeight-bodyHeight);
            scrollOffset = constrain(scrollOffset,0,maxScroll);

            const ctx = drawingContext;
            ctx.save();
            ctx.beginPath();
            ctx.rect(plotLeft,bodyTop,plotRight-plotLeft,bodyHeight);
            ctx.clip();

            // Month bands and grid stay fixed while packed storm rows scroll.
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

            // Light row guides make packed rows easier to follow.
            for(let r=0;r<=packedRows.length;r++){
                const y = bodyTop+r*ROW_HEIGHT-scrollOffset;
                if(y<bodyTop || y>bodyBottom) continue;
                stroke(COLORS.UI.greyText);
                strokeWeight(1);
                line(plotLeft,y,plotRight,y);
            }

            // Marker for the currently viewed simulation time.
            if(viewTick>=seasonStartTick && viewTick<=seasonEndTick){
                const nowX = map(viewTick,seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                stroke(COLORS.UI.text);
                strokeWeight(2);
                line(nowX,bodyTop,nowX,bodyBottom);
                strokeWeight(1);
            }

            const hovered = partAtPointer();
            const scale = UI.viewBasin.getScale(UI.viewBasin.mainSubBasin);
            for(const part of parts){
                const y = bodyTop+part.row*ROW_HEIGHT-scrollOffset;
                if(y+ROW_HEIGHT<bodyTop || y>bodyBottom) continue;

                if(part===hovered){
                    fill(COLORS.UI.buttonHover);
                    noStroke();
                    rect(part.occupiedStart-2,y+1,Math.max(4,part.occupiedEnd-part.occupiedStart+4),ROW_HEIGHT-2,3);
                }

                for(const seg of part.segments){
                    const x0 = map(seg.startTick,seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                    const x1 = map(seg.endTick+ADVISORY_TICKS,seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                    fill(scale.getColor(seg.cat,!seg.fullyTrop));
                    noStroke();
                    rect(x0,y+4,Math.max(2,x1-x0),ROW_HEIGHT-8,2);
                }

                const labelX = part.endX+4;
                const labelMax = Math.max(0,plotRight-labelX-2);
                const shownLabel = truncateLabel(part.label,labelMax);
                if(shownLabel){
                    fill(COLORS.UI.text);
                    noStroke();
                    textAlign(LEFT,CENTER);
                    textSize(11);
                    text(shownLabel,labelX,y+ROW_HEIGHT/2);
                }
            }
            ctx.restore();

            // Fixed month header.
            fill(COLORS.UI.text);
            noStroke();
            textAlign(CENTER,BOTTOM);
            textSize(11);
            for(let i=0;i<12;i++){
                const x0 = map(monthTicks[i],seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                const x1 = map(monthTicks[i+1],seasonStartTick,seasonEndTick,plotLeft,plotRight,true);
                text(monthNames[i],(x0+x1)/2,HEADER_HEIGHT-4);
            }

            if(maxScroll>0){
                const trackX = this.width-8;
                const thumbH = Math.max(26,bodyHeight*(bodyHeight/contentHeight));
                const thumbY = bodyTop+(bodyHeight-thumbH)*(scrollOffset/maxScroll);
                fill(COLORS.UI.buttonBox);
                noStroke();
                rect(trackX,bodyTop,5,bodyHeight);
                fill(COLORS.UI.text);
                rect(trackX,thumbY,5,thumbH);
            }
        };

        timelineBox.clickFunc = function(){
            const target = stormInfoPanel.target;
            if(target instanceof Storm || target===undefined)
                return originalTimelineClick.call(this);
            const part = partAtPointer();
            if(part)
                stormInfoPanel.target = part.storm;
        };

        // Wheel scrolling remains available only if packed rows still exceed
        // the visible timeline body. Most seasons should now fit at once again.
        if(window.__raptorSeasonTimelineWheel)
            window.removeEventListener('wheel',window.__raptorSeasonTimelineWheel);
        window.__raptorSeasonTimelineWheel = function(e){
            if(!timelineBox.showing || stormInfoPanel.target instanceof Storm) return;
            const mx = getMouseX();
            const my = getMouseY();
            if(mx<timelineBox.getX() || mx>=timelineBox.getX()+timelineBox.width ||
               my<timelineBox.getY() || my>=timelineBox.getY()+timelineBox.height) return;

            const bodyHeight = timelineBox.height-HEADER_HEIGHT-FOOTER_HEIGHT;
            const maxScroll = Math.max(0,packedRows.length*ROW_HEIGHT-bodyHeight);
            if(maxScroll<=0) return;
            scrollOffset = constrain(scrollOffset+Math.sign(e.deltaY)*ROW_HEIGHT*2,0,maxScroll);
            e.preventDefault();
        };
        window.addEventListener('wheel',window.__raptorSeasonTimelineWheel,{passive:false});
    };
})();
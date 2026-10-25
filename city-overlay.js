// Toggleable numeric city-wind labels. Names are confined to the optional detail
// card, and all rendering is observational: impacts advance only in Basin.
const CityOverlay = (()=>{
    let card,selectedId=null,lastBasin,labels=[];
    const unit=()=>[0,1,2].includes(simSettings.speedUnit)?simSettings.speedUnit:0;
    const unitName=()=>['kt','mph','km/h'][unit()];
    const number=wind=>Math.round(wind*[1,1.15078,1.852][unit()]);
    const mode=()=>[0,1,2].includes(simSettings.cityWindMode)?simSettings.cityWindMode:2;
    const colorFor=wind=>wind>=130?[224,123,255]:wind>=96?[255,105,103]:wind>=64?[255,166,74]:wind>=34?[255,221,98]:[216,233,246];
    function liveValues(city,profiles){
        const sample=WindField.sample(UI.viewBasin,profiles,city.coord,city.terrain,viewTick);
        return sample.backgroundKnown ? sample : {wind:NaN,gust:null};
    }
    const reading=(city,profiles)=>liveValues(city,profiles).wind;
    function valuesAt(basin,city,profiles){
        const history=viewTick<basin.tick && WindImpacts.cityAt(basin,city.id,viewTick);
        return history || liveValues(city,profiles);
    }
    function layout(cities,values){
        const placed=[];
        const format=value=>Number.isFinite(value)?String(number(value)):'—';
        push();textStyle(NORMAL);textSize(9);
        for(let i=0;i<cities.length;i++){
            const city=cities[i],value=values[i],wind=typeof value==='number'?value:value.wind;
            const gust=typeof value==='number'?null:value.gust;
            const text=mode()===0?format(wind):mode()===1?'G'+format(gust):format(wind)+' G'+format(gust);
            const width=Math.max(14,Math.ceil(textWidth(text))+5),height=12;
            const positions=[[6,-6],[-width-6,-6],[-width/2,-20],[-width/2,8],
                [8,-21],[-width-8,-21],[8,9],[-width-8,9],[15,-6],[-width-15,-6]];
            let best,bestCost=Infinity;
            for(const [dx,dy] of positions){
                const x=Math.max(2,Math.min(WIDTH-width-2,city.x+dx));
                const y=Math.max(75,Math.min(HEIGHT-height-32,city.y+dy));
                let cost=0;
                for(const old of placed){
                    const w=Math.max(0,Math.min(x+width+2,old.x+old.width)-Math.max(x-2,old.x));
                    const h=Math.max(0,Math.min(y+height+2,old.y+old.height)-Math.max(y-2,old.y));cost+=w*h;
                }
                for(const other of cities)if(other!==city && other.x>x-3 && other.x<x+width+3 && other.y>y-3 && other.y<y+height+3)cost+=120;
                if(cost<bestCost){bestCost=cost;best={city,text,wind,gust,x,y,width,height};}
                if(cost===0)break;
            }
            placed.push(best);
        }
        pop();
        return placed;
    }
    function drawCities(){
        const basin=UI.viewBasin;
        if(simSettings.showCityWinds===false || !(basin instanceof Basin) || !land || !land.drawn){
            labels=[];selectedId=null;if(card)card.hide();return;
        }
        if(lastBasin!==basin){lastBasin=basin;selectedId=null;if(card)card.hide();}
        const cities=CityLocations.visibleCities(basin);
        const profiles=WindField.profiles(basin,viewTick);
        labels=layout(cities,cities.map(c=>valuesAt(basin,c,profiles)));
        push();textStyle(NORMAL);textSize(9);textAlign(CENTER,CENTER);
        for(const label of labels){
            const c=label.city,rgb=colorFor(mode()===1?label.gust:label.wind);
            stroke(17,24,35,200);strokeWeight(1);
            line(c.x,c.y,label.x+label.width/2,label.y+label.height/2);
            fill(...rgb);stroke(12,18,30);ellipse(c.x,c.y,c.id===selectedId?8:5,c.id===selectedId?8:5);
            noStroke();fill(12,20,33,225);rect(label.x,label.y,label.width,label.height,2);
            fill(...rgb);text(label.text,label.x+label.width/2,label.y+label.height/2);
        }
        noStroke();fill(12,20,33,230);rect(5,33,284,19,3);
        fill(231,241,250);textAlign(LEFT,CENTER);textSize(10);
        const description=['1-min wind','G estimated 3-sec gust','1-min / G 3-sec gust'][mode()];
        text('City · '+description+' · '+unitName()+' · est.',11,42);
        pop();
    }
    function pick(x,y){
        if(simSettings.showCityWinds===false || lastBasin!==UI.viewBasin)return null;
        let best=null,distance=12;
        for(const label of labels){
            if(x>=label.x-2 && x<=label.x+label.width+2 && y>=label.y-2 && y<=label.y+label.height+2)return label.city;
            const d=Math.hypot(label.city.x-x,label.city.y-y);
            if(d<distance){distance=d;best=label.city;}
        }
        return best;
    }
    function show(city){selectedId=city.id;selectStorm();refreshTracks(true);card.show();}
    const previousInit=UI.init;
    UI.init=function(){
        previousInit.call(UI);
        const previousRender=primaryWrapper.renderFunc;
        primaryWrapper.renderFunc=function(s){previousRender.call(this,s);drawCities();};
        const previousClick=primaryWrapper.clickFunc;
        primaryWrapper.clickFunc=function(){
            const city=pick(getMouseX(),getMouseY());
            if(city){show(city);return;}
            selectedId=null;card.hide();previousClick.call(this);
        };
        card=primaryWrapper.append(false,8,59,278,232,function(s){
            if(simSettings.showCityWinds===false || sideMenu.showing || TemperatureEditor.panel.showing || selectedStorm){this.hide();return;}
            const basin=UI.viewBasin;
            const city=CityLocations.context(basin).cities.find(c=>c.id===selectedId);
            if(!city){this.hide();return;}
            fill(17,24,37,245);stroke(105,125,150);strokeWeight(1);s.fullRect();noStroke();
            fill(238,245,255);textAlign(LEFT,TOP);textStyle(BOLD);textSize(16);
            text(city.name.slice(0,29),12,12);textStyle(NORMAL);textSize(12);
            const {wind,gust}=valuesAt(basin,city,WindField.profiles(basin,viewTick));
            const stats=WindImpacts.cityAt(basin,city.id,viewTick);
            const recorded=stats && basin.windImpacts && basin.windImpacts.cities[city.id];
            const peak=recorded?stats.peakWind:null;
            const peakGust=recorded && Number.isFinite(stats.peakGust)?stats.peakGust:null;
            const rows=[['Local wind (1-min)',Number.isFinite(wind)?number(wind)+' '+unitName():'—'],
                ['Gust (est. 3-sec)',Number.isFinite(gust)?number(gust)+' '+unitName():'—'],
                ['Peak recorded wind',peak===null?'—':number(peak)+' '+unitName()],
                ['Peak recorded gust',peakGust===null?'—':number(peakGust)+' '+unitName()],
                ['Hours at ≥34 kt',stats?stats.hours+' h':'—'],
                ['Nearby area damage',stats?damageDisplayNumber(stats.damage):'—'],
                ['Nearby area deaths',stats?String(stats.deaths):'—']];
            let y=44;
            for(const [label,value] of rows){fill(185,202,222);textAlign(LEFT,TOP);text(label,12,y);
                fill(242,247,255);textAlign(RIGHT,TOP);text(value,266,y);y+=22;}
            textAlign(LEFT,TOP);textSize(10);fill(168,188,210);
            text(stats?'Game estimates; peaks since tracking':'Area tracking starts after this date',12,212);
        },true,false);
        card.append(false,250,7,21,21,s=>s.button('×',false,17),()=>{card.hide();selectedId=null;});
    };
    return {drawCities,layout,pick,reading,valuesAt,mode,unitName,number,
        get labels(){return labels;},get card(){return card;}};
})();

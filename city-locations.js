// City dots represent a fixed selection of locations, independent of storms.
// The land grid is also used by the impact engine; drawing never mutates it.
const CityLocations = (()=>{
    const CELL=6,MAX_CITIES=85,CHINA_DOT_SPACING=36;
    const cache=new WeakMap();
    const distance=TemperatureAdjustments.distanceKm;
    const inMap=p=>p.x>=3 && p.x<WIDTH-3 && p.y>=36 && p.y<HEIGHT-36;
    function context(basin){
        const previous=cache.get(basin);
        if(previous && previous.land===land)return previous;
        const cities=[],cells=[];
        const earth=MAP_TYPES[basin.mapType].form==='earth';
        if(earth){
            for(const [id,name,longitude,latitude,population] of CITY_CATALOG){
                let coord=new Coordinate(longitude,latitude),p=WindField.project(basin.mapType,coord);
                if(!inMap(p))continue;
                if(cities.some(c=>Math.hypot(c.x-p.x,c.y-p.y)<13))continue;
                if(!land.get(coord)){
                    // Accommodate the bundled coastline's coarse pixel resolution.
                    search:for(const km of [10,20,30])for(let bearing=0;bearing<8;bearing++){
                        const angle=bearing*Math.PI/4;
                        const candidate=new Coordinate(longitude+km*Math.sin(angle)/(111.195*Math.max(0.1,Math.cos(latitude*Math.PI/180))),
                            latitude+km*Math.cos(angle)/111.195);
                        if(land.get(candidate)){coord=candidate;p=WindField.project(basin.mapType,coord);break search;}
                    }
                }
                if(!inMap(p))continue;
                if(cities.some(c=>Math.hypot(c.x-p.x,c.y-p.y)<12))continue;
                cities.push({id,name,coord,x:p.x,y:p.y,population,terrain:land.get(coord)});
                if(cities.length===MAX_CITIES)break;
            }
        }
        const bounds=MAP_TYPES[earth?basin.mapType:6];
        const longitudeSpan=(bounds.east<bounds.west?bounds.east+360:bounds.east)-bounds.west;
        for(let y=CELL/2;y<HEIGHT;y+=CELL)for(let x=CELL/2;x<WIDTH;x+=CELL){
            const coord=Coordinate.convertFromXY(basin.mapType,x,y),terrain=land.get(coord);
            if(!terrain)continue;
            const exposure=Math.pow(0.8,Math.min(30,Math.max(0,(terrain-0.5)*60)))*(1+basin.hemY(y)/HEIGHT)/2;
            const dlat=Math.abs(bounds.north-bounds.south)/HEIGHT*CELL*Math.PI/180;
            const dlon=longitudeSpan/WIDTH*CELL*Math.PI/180;
            const area=6371**2*dlon*Math.abs(Math.sin(coord.latitude*Math.PI/180+dlat/2)-Math.sin(coord.latitude*Math.PI/180-dlat/2));
            cells.push({key:x+','+y,x,y,coord,terrain,exposure,area,sub:land.getSubBasin(coord)});
        }
        if(!earth){
            for(const cell of cells.slice().sort((a,b)=>b.exposure-a.exposure || a.y-b.y || a.x-b.x)){
                if(!inMap(cell) || cities.some(c=>Math.hypot(c.x-cell.x,c.y-cell.y)<65))continue;
                cities.push({id:'synthetic:'+basin.mapType+':'+cell.key,name:'Settlement '+(cities.length+1),
                    coord:cell.coord,x:cell.x,y:cell.y,population:250000,terrain:cell.terrain});
                if(cities.length===30)break;
            }
        }
        for(const cell of cells){
            let nearest=null,best=Infinity;
            for(const city of cities){const km=distance(cell.coord,city.coord);if(km<best){best=km;nearest=city;}}
            cell.cityId=best<=300 && nearest ? nearest.id : null;
            const urban=nearest ? nearest.population/(2*Math.PI*70**2)*Math.exp(-best*best/(2*70**2)) : 0;
            cell.population=Math.max(0,Math.round(cell.area*Math.min(250,8+urban)*cell.exposure));
            cell.assets=cell.population*40000;
        }
        const value={land,cities,cells};cache.set(basin,value);return value;
    }
    function visibleCities(basin){
        // Declutter the display only. Keep all existing city exposure, IDs and
        // history intact so hiding a label cannot change losses or population.
        const visible=[],china=[];
        for(const city of context(basin).cities){
            if(CITY_CHINA_IDS.has(city.id)){
                if(china.some(c=>Math.hypot(c.x-city.x,c.y-city.y)<CHINA_DOT_SPACING))continue;
                china.push(city);
            }
            visible.push(city);
        }
        return visible;
    }
    return {CELL,MAX_CITIES,CHINA_DOT_SPACING,context,visibleCities};
})();

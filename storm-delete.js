// Raptor Mod 0.8.1: manual storm termination.
// "Delete Storm" means remove an active system from the live simulation while
// preserving its historical record, timeline entry, designations and statistics.
(function(){
    const originalUIInit = UI.init;

    UI.init = function(){
        originalUIInit.call(UI);

        let endingStorm = false;

        const terminateStorm = storm=>{
            if(!(storm instanceof Storm) || endingStorm || !paused) return;
            const basin = storm.basin;
            if(!(basin instanceof Basin) || basin!==UI.viewBasin) return;
            if(!basin.viewingPresent() || !storm.current) return;

            endingStorm = true;
            try{
                const active = storm.current;

                // Mirror the simulator's ordinary death bookkeeping, but do NOT
                // remove the Storm from Season.systems or alter any accumulated
                // season statistics. Its history remains completely intact.
                storm.deathTime = basin.tick;
                if(storm.TC && storm.dissipationTime===undefined)
                    storm.dissipationTime = basin.tick;
                if(storm.inBasinTC && storm.exitTime===undefined)
                    storm.exitTime = basin.tick;
                storm.current = undefined;

                // Remove only the live ActiveSystem from the map/simulation.
                for(let i=basin.activeSystems.length-1;i>=0;i--){
                    if(basin.activeSystems[i]===active || basin.activeSystems[i].storm===storm)
                        basin.activeSystems.splice(i,1);
                }

                // Mark relevant seasons dirty so the now-finished storm record is
                // persisted normally. Names/numbers, ACE and impacts are untouched.
                const origin = basin.fetchSeason(storm.originSeason());
                if(origin instanceof Season) origin.modified = true;
                if(storm.inBasinTC){
                    const statistical = basin.fetchSeason(storm.statisticalSeason());
                    if(statistical instanceof Season) statistical.modified = true;
                }

                selectedStorm = undefined;
                forecastTracks.clear();
                refreshTracks(true);

                // Deletion changes the basin without advancing time, so force the
                // save indicator to show that the basin has unsaved changes.
                basin.lastSaved = -1;

                console.info('Raptor Mod: manually ended active storm; history preserved.',storm);
            }catch(err){
                console.error('Raptor Mod: manual storm termination failed',err);
            }finally{
                endingStorm = false;
            }
        };

        // Console helper. Despite the legacy name, this now only ends the active
        // system and deliberately keeps its historical Storm object.
        window.deleteStormFromBasin = terminateStorm;
        window.endActiveStorm = terminateStorm;

        // Put the control one row above the stock Jump To / View Timeline controls.
        // It appears only for a storm that is alive RIGHT NOW, so historical storms
        // cannot accidentally be erased or modified from the archive/timeline.
        const deleteButton = stormInfoPanel.append(false,30,stormInfoPanel.height-81,stormInfoPanel.width-60,24,function(s){
            const storm = stormInfoPanel.target;
            const visible = storm instanceof Storm && !!storm.current &&
                UI.viewBasin instanceof Basin && UI.viewBasin.viewingPresent();
            this.setBox(30,stormInfoPanel.height-81,visible ? stormInfoPanel.width-60 : 0,24);
            if(visible) s.button('Delete Storm',true,15,!paused || endingStorm);
        },function(){
            const storm = stormInfoPanel.target;
            if(!(storm instanceof Storm) || !storm.current || !paused || endingStorm) return;
            if(!(UI.viewBasin instanceof Basin) || !UI.viewBasin.viewingPresent()) return;

            let label = storm.getNameByTick(-1) || storm.getFullNameByTick('peak') || 'this storm';
            if(label.length>30) label = label.slice(0,27)+'...';
            areYouSure.dialog(()=>terminateStorm(storm),'End "'+label+'" now? History will be kept.');
        });

        window.__raptorDeleteStormButton = deleteButton;
    };
})();
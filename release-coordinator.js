// Raptor Mod release coordinator.
// Loaded last so older feature modules cannot accidentally downgrade the visible
// build marker or hide newer changelog entries when they register themselves.
(function(){
    const BUILD = '0.12.1';
    const BUILD_DATE = '21 Aug 2026';

    const RELEASES = [
        {
            build: '0.12.1',
            date: BUILD_DATE,
            changes: [
                'Adjusted Normal-mode Caribbean steering so tropical systems gain a more realistic WNW/NW tendency while crossing the central and western Caribbean.',
                'The poleward turn strengthens toward the western Caribbean and is strongest roughly from 15-22 N, helping more systems reach the Yucatan Channel and Gulf instead of remaining locked due west.',
                'Added a time-varying steering pulse so direct Yucatan, Central America, and lower-latitude tracks still occur instead of forcing every cyclone into the Gulf.',
                'Slightly reduced trade-wind dominance during those turning setups and added a weaker matching upper-level northward component for deep hurricanes.',
                'Repaired the release-number collision: the Atlantic steering overhaul is now build 0.12.0, while the original Human Risk 0.10.0/0.10.1 and Season Details 0.11.0 entries are restored.'
            ]
        },
        {
            build: '0.12.0',
            date: BUILD_DATE,
            changes: [
                'Retuned Normal-mode Atlantic steering with an Atlantic-specific seasonal circulation model.',
                'Shifted the North Atlantic jet north to roughly 41-43 N in winter and 49-50 N in peak summer, with a much narrower realistic meander envelope.',
                'Added a broad, smoothly wandering Bermuda/Azores subtropical ridge that influences both low- and upper-level steering.',
                'Gulf, Caribbean, western-Atlantic, and recurvature flow can now vary with the position and strength of the subtropical ridge instead of following nearly uniform zonal steering.',
                'Clamped the Atlantic trade-wind angle interpolation to its intended bounds instead of extrapolating outside the control range.',
                'Kept steering behavior for non-Atlantic basin maps unchanged.'
            ]
        },
        {
            build: '0.11.0',
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
        },
        {
            build: '0.10.1',
            date: BUILD_DATE,
            changes: [
                'Moved the Human Risk legend higher so it no longer sits awkwardly on top of the bottom UI bar.',
                'Increased Human Risk overlay visibility, especially for lower-risk cells, by using stronger opacity.',
                'Added hover feedback for active Human Risk cells, including a highlighted grid cell and a tooltip with the current risk category and Risk Index /100.'
            ]
        },
        {
            build: '0.10.0',
            date: BUILD_DATE,
            changes: [
                'Added a toggleable Human Risk Overlay to Settings.',
                'Current risk combines the existing land/exposure proxy with active-cyclone wind, pressure, distance, and cyclone type.',
                'Risk is displayed only over exposed land using Low / Moderate / High / Extreme heatmap colors.',
                'The heatmap refreshes every three simulated hours and also reacts immediately to paused storm spawning/deletion.',
                'Storm tracks, forecast tracks, and icons are redrawn above the risk layer so meteorological information stays readable.',
                'This first version uses the simulator exposure proxy rather than an external real-world population dataset.'
            ]
        }
    ];

    const changelog = window.RAPTOR_MOD_CHANGELOG;
    if(Array.isArray(changelog)){
        // Remove the accidentally reused 0.10.0 Atlantic-steering entry. That
        // collision prevented the real Human Risk 0.10.0 module from registering.
        for(let i=changelog.length-1;i>=0;i--){
            const release = changelog[i];
            if(release && Array.isArray(release.changes) &&
               release.changes.some(c=>c.indexOf('Retuned Normal-mode Atlantic steering')!==-1))
                changelog.splice(i,1);
        }

        for(const release of RELEASES){
            const index = changelog.findIndex(r=>r && r.build===release.build);
            if(index===-1)
                changelog.push(release);
        }

        const versionParts = v=>(''+v).split('.').map(n=>parseInt(n,10)||0);
        changelog.sort((a,b)=>{
            const av = versionParts(a.build);
            const bv = versionParts(b.build);
            const n = Math.max(av.length,bv.length);
            for(let i=0;i<n;i++){
                const d = (bv[i]||0)-(av[i]||0);
                if(d) return d;
            }
            return 0;
        });
    }

    window.RAPTOR_MOD_BUILD = BUILD;

    // Older late-loaded modules (Human Risk and Season Details) were written to
    // claim the global build marker themselves. Wrap UI.init last and restore the
    // actual newest release after all of those feature-specific wrappers run.
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
    };
})();

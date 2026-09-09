// Raptor Mod release coordinator.
// Loaded last so older feature modules cannot accidentally downgrade the visible
// build marker or hide newer changelog entries when they register themselves.
(function(){
    const BUILD = '0.17.2';
    const BUILD_DATE = '9 Sep 2026';
    const DATE_23 = '23 Aug 2026';
    const DATE_22 = '22 Aug 2026';
    const DATE_21 = '21 Aug 2026';

    const RELEASES = [
        {
            build: '0.17.2',
            date: BUILD_DATE,
            changes: [
                'Added a 36-hour environment-gated genesis assist to manually spawned God Mode Lows only.',
                'Manual Lows in warm, moist, low-shear ocean environments now consolidate organization faster toward the existing TD threshold.',
                'Limited the stock weak-wave pressure-rise bias during the assist so favorable manual Lows no longer commonly drift from roughly 1012 hPa toward 1020 hPa before developing.',
                'Added a modest pre-TD pressure and wind response so favorable manual Lows can begin deepening within hours instead of crossing much of an ocean first.',
                'The assist expires with simulated time, stops immediately after tropical development, and provides no boost over land, cool water, dry air, or strong shear.',
                'Natural tropical waves remain completely unflagged, so natural spawn climatology and ordinary genesis physics are unchanged.',
                'The manual-Low assist timer is persisted in current saves and applies consistently across simulation modes.'
            ]
        },
        {
            build: '0.17.1',
            date: BUILD_DATE,
            changes: [
                'Retuned the manually spawned God Mode Low so it can begin strengthening sooner in favorable environments.',
                'God Mode Low initial state changed from 1015 hPa / 15 kt / 0.20 organization to 1012 hPa / 20 kt / 0.35 organization.',
                'Natural tropical-wave spawning, global cyclone physics, intensification limits, and Calm-mode climatology are unchanged.',
                'Applied the same manual Low starting-state tuning to Experimental mode while preserving its extra kaboom state.'
            ]
        },
        {
            build: '0.17.0',
            date: BUILD_DATE,
            changes: [
                'Added Calm simulation mode as a lower-activity alternative to Normal.',
                'Reduced tropical-wave spawning by roughly 50% while preserving the normal seasonal cycle.',
                'Reduced extratropical seed-system spawning for quieter overall seasons.',
                'Lowered Calm-mode tropical SST climatology by about 1 C compared with Normal and slightly cooled the polar profile.',
                'Reduced background atmospheric moisture so marginal disturbances struggle more often.',
                'Increased effective environmental wind shear by 10% without changing storm steering vectors or tracks directly.',
                'Calm inherits the currently tuned Normal-mode storm lifecycle, recovery, steering, and environmental hooks instead of duplicating older cyclone physics.',
                'Appended Calm after the existing simulation modes so saved numeric mode IDs remain compatible.'
            ]
        },
        {
            build: '0.16.0',
            date: DATE_23,
            changes: [
                'Added a persistent Storm Debug Mode toggle to Settings with a live diagnostics panel for the selected active storm.',
                'Added core-state diagnostics for pressure, wind, organization, depth, lower/upper warm core, current classification, peak intensity, ACE, storm age, and impact totals.',
                'Added live Normal-mode pressure/wind targets, target gaps, configured and actually applied intensification rates, hourly pressure caps, rolling 24-hour wind caps, and 1/6/12/24-hour intensity changes.',
                'Added environmental diagnostics for SST, moisture, environmental and interaction shear, land/ocean state, jet-relative position, and a heuristic likely-limiter readout.',
                'Added explicit Very Favorable, RI Eligible, and Elite RI status plus per-condition RI gate checks for SST, moisture, shear, warm-core structure, and organization.',
                'Added recovery diagnostics including recovery pathway state, favorability, 72-hour structural-memory time remaining, and weak-low timeout state.',
                'Added low-level, upper-level, blended/final steering, Fujiwhara interaction, LL/UL depth weights, live coordinates, sampled land/ocean exposure time, and internal lifecycle flags.',
                'Debug instrumentation is observational only and does not alter storm physics, steering, lifecycle, or environmental fields.'
            ]
        },
        {
            build: '0.15.0',
            date: DATE_23,
            changes: [
                'Split the combined Storm Intensification Rate control into separate Pressure Deepening and Wind Intensification sliders for Normal mode.',
                'Both sliders now use direct response units: percent of the remaining pressure or wind target gap closed per simulated hour.',
                'Kept the 0.14.0 default pacing unchanged at 1.96% pressure gap/hr and 5.6% wind gap/hr, while allowing wind and pressure response to be tuned independently.',
                'Pressure Deepening can be adjusted from 0.50% to 5.00% gap/hr; Wind Intensification can be adjusted from 2.0% to 15.0% gap/hr.',
                'The pressure control governs pressure deepening and its hourly pressure-drop safety cap, while the wind control governs wind response and rolling 24-hour wind-gain limits.',
                'Rapid Intensification environmental gating and weakening behavior remain unchanged.'
            ]
        },
        {
            build: '0.14.0',
            date: DATE_22,
            changes: [
                'Added a persistent Storm Intensification Rate slider to Settings for Normal mode, adjustable from 25% to 125% in 5% steps.',
                'Changed the default intensification pace to 70% of the 0.13.0 rate after continued testing showed storms were still strengthening too quickly; selecting 100% reproduces the 0.13.0 pacing.',
                'The slider scales tropical pressure deepening, wind response, hourly pressure-change limits, and rolling 24-hour strengthening limits together across every basin map.',
                'Rapid Intensification remains environmentally gated by warm water, moisture, low shear, a mature warm core, and sufficient organization; non-RI environments remain capped below +30 kt in 24 hours even at faster slider settings.',
                'Weakening behavior remains unchanged, and the selected intensification rate also governs the existing storm-recovery pathway.'
            ]
        },
        {
            build: '0.13.0',
            date: DATE_21,
            changes: [
                'Retuned Normal-mode tropical cyclone intensification rates globally across every basin map.',
                'Reduced routine pressure deepening from the stock ~5% hourly response to an effective ~2.8% baseline, with faster deepening reserved for genuinely exceptional environments.',
                'Reduced routine wind adjustment from the stock 15% hourly response to an 8% baseline so winds no longer race almost instantly toward the pressure-derived target.',
                'Added an environmental RI gate requiring warm water, high moisture, low shear, a mature warm core, and sufficient organization before 30+ kt / 24 h intensification is allowed.',
                'Added a rolling 24-hour intensification governor: ordinary setups are capped near +20 kt/day, very favorable but non-RI setups below +30 kt/day, exceptional RI up to about +45 kt/day, and rare elite setups up to about +60 kt/day.',
                'Weakening behavior is left untouched, and the existing storm-recovery pathway now passes through the same strengthening governor so recovery cannot bypass the new pacing.'
            ]
        },
        {
            build: '0.12.1',
            date: DATE_21,
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
            date: DATE_21,
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
            date: DATE_21,
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
            date: DATE_21,
            changes: [
                'Moved the Human Risk legend higher so it no longer sits awkwardly on top of the bottom UI bar.',
                'Increased Human Risk overlay visibility, especially for lower-risk cells, by using stronger opacity.',
                'Added hover feedback for active Human Risk cells, including a highlighted grid cell and a tooltip with the current risk category and Risk Index /100.'
            ]
        },
        {
            build: '0.10.0',
            date: DATE_21,
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

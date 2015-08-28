/*!

   MPEG-DASH engine plugin for Flowplayer HTML5

   Released under the MIT License:
   http://www.opensource.org/licenses/mit-license.php

   requires:
   - Flowplayer HTML5 version 6.x or greater
   - Google Shaka Player (shaka-player.compiled.js) https://github.com/google/shaka-player
*/

(function () {
    // Do not install Shaka Fullscreen polyfill, already managed by Flowplayer
    shaka.polyfill.CustomEvent.install();
    shaka.polyfill.MediaKeys.install();
    shaka.polyfill.VideoPlaybackQuality.install();
            
    var win = window,
        clientSupport = flowplayer.support.video && 
            (
                shaka.player.Player.isBrowserSupported() || 
                !!window.MediaSource // Best effort: basic MPEG-Dash playback requirements
            ),

        engineImpl = function mpegdashEngine(player, root) {
            var bean = flowplayer.bean,
                common = flowplayer.common,
                shakaPlayer,
                videoTag,
                preventDashResume = false,
                isReady = false,
                
                _initVideo =  function(video)
                {
                    videoTag = common.createElement("video");
                    
                    bean.on(videoTag, "play", function () {
                        if (preventDashResume) {
                            // doing this here using variable
                            // avoids resume firing
                            videoTag.pause();
                            preventDashResume = false;
                        } else {
                            player.trigger('resume', [player]);
                        }
                    });
                    bean.on(videoTag, "pause", function () {
                        player.trigger('pause', [player]);
                    });
                    bean.on(videoTag, "timeupdate", function () {
                        player.trigger('progress', [player, videoTag.currentTime]);
                    });
                    bean.on(videoTag, "loadeddata", function () {
                        flowplayer.extend(video, {
                            duration: videoTag.duration,
                            seekable: videoTag.seekable.end(null),
                            width: videoTag.videoWidth,
                            height: videoTag.videoHeight,
                            url: videoTag.currentSrc
                        });

                        isReady = true;

                        player.trigger('ready', [player, video]);
                    });
                    bean.on(videoTag, "seeked", function () {
                        player.trigger('seek', [player, videoTag.currentTime]);
                    });
                    bean.on(videoTag, "progress", function (e) {
                        try {
                            var buffered = videoTag.buffered,
                                buffer = buffered.end(0), // first loaded buffer
                                ct = videoTag.currentTime,
                                buffend = 0,
                                i;

                            // buffered.end(null) will not always return the current buffer
                            // so we cycle through the time ranges to obtain it
                            if (ct) {
                                for (i = 1; i < buffered.length; i = i + 1) {
                                    buffend = buffered.end(i);

                                    if (buffend >= ct && buffered.start(i) <= ct) {
                                        buffer = buffend;
                                    }
                                }
                            }
                            video.buffer = buffer;
                        } catch (ignored) {}
                        player.trigger('buffer', [player, e]);
                    });
                    bean.on(videoTag, "ended", function () {
                        player.trigger('finish', [player]);
                    });
                    bean.on(videoTag, "volumechange", function () {
                        player.trigger('volume', [player, videoTag.volume]);
                    });

                    videoTag.className = 'fp-engine mpegdash-engine';
                    common.prepend(common.find(".fp-player", root)[0], videoTag);

                    player.on("beforeseek", function () {
                        preventDashResume = player.conf.autoplay && player.paused;
                    });
                },

                engine = {
                    engineName: engineImpl.engineName,

                    pick: function (sources) {
                        var i,
                            source;

                        for (i = 0; i < sources.length; i = i + 1) {
                            source = sources[i];
                            if (source.type === "application/dash+xml") {
                                return source;
                            }
                        }
                    },

                    load: function(video)
                    {
                        common.removeNode(common.findDirect("video", root)[0] || common.find(".fp-player > video", root)[0]);

                        _initVideo(video);
                        
                        /* Shaka */         
                        shakaPlayer = new shaka.player.Player(videoTag);

                        shakaPlayer.addEventListener('error', function(event) {
                            console.error(event);
                        });
                        
                        if( ! video.shaka)
                            video.shaka = {};
                        
                        var estimator = video.shaka.bandwidthEstimator ? video.shaka.bandwidthEstimator : new shaka.util.EWMABandwidthEstimator(),
                            contentProtectionCallback = video.shaka.contentProtectionCallback ? video.shaka.contentProtectionCallback : null,
                            source = new shaka.player.DashVideoSource(video.src, contentProtectionCallback, estimator),
                            onLoad = typeof video.shaka.onLoad === 'function' ? video.shaka.onLoad : null;

                        if(onLoad) {
                            shakaPlayer.load(source).then(function(){onLoad.call(shakaPlayer);});
                        } else {
                            shakaPlayer.load(source);
                        }
                        
                        if (player.conf.autoplay) {
                            // https://github.com/flowplayer/flowplayer/issues/910
                            // Android and Win Firefox
                            videoTag.play();
                        }
                    },

                    play: function () {
                        videoTag.play();
                    },

                    resume: function () {
                        videoTag.play();
                    },

                    pause: function () {
                        videoTag.pause();
                    },

                    seek: function (time) {
                        videoTag.currentTime = time;
                    },

                    volume: function (level) {
                        if (videoTag) {
                            videoTag.volume = level;
                        }
                    },

                    speed: function (val) {
                        videoTag.playbackRate = val;
                        player.trigger('speed', [player, val]);
                    },

                    unload: function () {
                        if (isReady) {
                            shakaPlayer.unload();
                            common.removeNode(videoTag);
                        }
                        
                        player.trigger('unload', [player]);
                    }
                };

            return engine;
        };

    engineImpl.engineName = 'mpegdash-shaka-' + shaka.player.Player.version;
    engineImpl.canPlay = function (type) {
        return type === "application/dash+xml";
    };

    // only load engine if it can be used
    if (clientSupport) {
        flowplayer.engines.unshift(engineImpl);
    }
}());

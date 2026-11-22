/* Bounded, same-origin diagnostics for the legacy Flash loading queue. */
(function () {
  'use strict';
  var client = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  var reports = 0, samples = 0, bootSent = false, previous = Date.now();
  var probes = 0, probed = {}, images = [];
  function report(message) {
    if (reports >= 40) return;
    var encoded = encodeURIComponent(message);
    if (encoded.length > 900) return;
    reports++;
    var image = new Image();
    images.push(image);
    image.onload = image.onerror = function () {
      var index = images.indexOf(image);
      if (index >= 0) images.splice(index, 1);
    };
    image.src = '/__hikari_pending/' + encoded;
  }
  function probe(job, scene) {
    var path = String(job.url || '');
    if (probes >= 2 || probed[path] || !/^\/rez\/[A-Za-z0-9_./-]+\.(png|swf|mp3)$/.test(path)) return;
    probed[path] = true; probes++;
    var xhr = new XMLHttpRequest(), start = Date.now(), first = 0, done = false;
    function finish(event) {
      if (done) return;
      done = true;
      report('LX3|id=' + client + '|scene=' + scene + '|event=' + event
        + '|status=' + xhr.status + '|first=' + first + '|ms=' + (Date.now() - start)
        + '|bytes=' + (xhr.response ? xhr.response.byteLength : 0)
        + '|cache=' + (xhr.getResponseHeader('CF-Cache-Status') || '')
        + '|ray=' + (xhr.getResponseHeader('CF-RAY') || '') + '|url=' + path);
    }
    xhr.open('GET', path, true); xhr.responseType = 'arraybuffer'; xhr.timeout = 20000;
    xhr.onreadystatechange = function () { if (xhr.readyState >= 2 && !first) first = Date.now() - start; };
    xhr.onprogress = function (event) { if (event.total > 8 * 1024 * 1024) xhr.abort(); };
    xhr.onload = function () { finish('load'); };
    xhr.onerror = function () { finish('error'); };
    xhr.ontimeout = function () { finish('timeout'); };
    xhr.onabort = function () { finish('abort'); };
    xhr.send(null);
  }
  function poll() {
    if (samples >= 36) return;
    var now = Date.now(), gap = now - previous;
    previous = now;
    var game = document.getElementById('bangbang');
    if (!game) return;
    try {
      if (!game.getLoadingDiagnostics) return;
      var state = game.getLoadingDiagnostics();
      if (!state || state.build !== 'WATCH20261024' || !state.active) return;
      if (!bootSent) { report('LB3|id=' + client + '|build=' + state.build); bootSent = true; }
      if (!state.active.length && !state.queued && !state.observers) return;
      samples++;
      var scene = Number(state.scene) || 0;
      var prefix = 'LD3|id=' + client + '|build=' + state.build + '|scene=' + scene
        + '|n=' + samples + '|clock=' + state.clock + '|gap=' + gap
        + '|mem=' + Math.round(state.memory / 1048576) + '|q=' + state.queued
        + '|obs=' + state.observers + '|active=' + state.active.length;
      var jobs = [];
      for (var i = 0; i < state.active.length; i++) {
        var job = state.active[i];
        // Native snapshots already remove URL queries and fragments. Strip again
        // at the bridge boundary so telemetry cannot record launch credentials.
        var path = String(job.url || '').split('?')[0].split('#')[0];
        jobs.push(i + ':' + job.type + ':' + job.loaded + '/' + job.total + ':'
          + job.elapsed + ':' + Math.round(job.bps) + ':' + path.slice(-120));
      }
      // Split when necessary instead of exceeding the existing endpoint limit.
      var line = prefix;
      for (var j = 0; j < jobs.length; j++) {
        if (encodeURIComponent(line + '|job=' + jobs[j]).length > 900) {
          report(line); line = prefix;
        }
        line += '|job=' + jobs[j];
      }
      report(line);
      // At most two small, read-only browser downloads for the entire page.
      // They compare browser delivery with Flash's active transfer; their URLs
      // intentionally omit query parameters, so cache keys may differ.
      if (scene && state.queued > 20) {
        for (var k = 0; k < state.active.length && probes < 2; k++) probe(state.active[k], scene);
      }
    } catch (error) { /* Older clients or a closing plugin need no intervention. */ }
  }
  setInterval(poll, 10000);
}());

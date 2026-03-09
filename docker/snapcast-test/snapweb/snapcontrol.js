"use strict";
class Host {
    constructor(json) {
        this.arch = "";
        this.ip = "";
        this.mac = "";
        this.name = "";
        this.os = "";
        this.fromJson(json);
    }
    fromJson(json) {
        this.arch = json.arch;
        this.ip = json.ip;
        this.mac = json.mac;
        this.name = json.name;
        this.os = json.os;
    }
}
class Client {
    constructor(json) {
        this.id = "";
        this.connected = false;
        this.fromJson(json);
    }
    fromJson(json) {
        this.id = json.id;
        this.host = new Host(json.host);
        let jsnapclient = json.snapclient;
        this.snapclient = { name: jsnapclient.name, protocolVersion: jsnapclient.protocolVersion, version: jsnapclient.version };
        let jconfig = json.config;
        this.config = { instance: jconfig.instance, latency: jconfig.latency, name: jconfig.name, volume: { muted: jconfig.volume.muted, percent: jconfig.volume.percent } };
        this.lastSeen = { sec: json.lastSeen.sec, usec: json.lastSeen.usec };
        this.connected = Boolean(json.connected);
    }
}
class Group {
    constructor(json) {
        this.name = "";
        this.id = "";
        this.stream_id = "";
        this.muted = false;
        this.clients = [];
        this.fromJson(json);
    }
    fromJson(json) {
        this.name = json.name;
        this.id = json.id;
        this.stream_id = json.stream_id;
        this.muted = Boolean(json.muted);
        for (let client of json.clients)
            this.clients.push(new Client(client));
    }
    getClient(id) {
        for (let client of this.clients) {
            if (client.id == id)
                return client;
        }
        return null;
    }
}
class Stream {
    constructor(json) {
        this.id = "";
        this.status = "";
        this.properties = {};
        this.metadata = {};
        this.fromJson(json);
    }
    fromJson(json) {
        this.id = json.id;
        this.status = json.status;
        let juri = json.uri;
        this.uri = { raw: juri.raw, scheme: juri.scheme, host: juri.host, path: juri.path, fragment: juri.fragment, query: juri.query };
        if (json.properties) {
            this.updateProperties(json.properties);
        }
    }
    updateProperties(properties) {
        if (!properties)
            return;
        this.properties = Object.assign({}, this.properties, properties);
        if (Object.prototype.hasOwnProperty.call(properties, "metadata")) {
            let metadataUpdate = properties.metadata || {};
            this.metadata = Object.assign({}, this.metadata, metadataUpdate);
            this.properties.metadata = this.metadata;
        }
    }
}
class Server {
    constructor(json) {
        this.groups = [];
        this.streams = [];
        if (json)
            this.fromJson(json);
    }
    fromJson(json) {
        this.groups = [];
        for (let jgroup of json.groups)
            this.groups.push(new Group(jgroup));
        let jsnapserver = json.server.snapserver;
        this.server = { host: new Host(json.server.host), snapserver: { controlProtocolVersion: jsnapserver.controlProtocolVersion, name: jsnapserver.name, protocolVersion: jsnapserver.protocolVersion, version: jsnapserver.version } };
        this.streams = [];
        for (let jstream of json.streams) {
            this.streams.push(new Stream(jstream));
        }
    }
    getClient(id) {
        for (let group of this.groups) {
            let client = group.getClient(id);
            if (client)
                return client;
        }
        return null;
    }
    getGroup(id) {
        for (let group of this.groups) {
            if (group.id == id)
                return group;
        }
        return null;
    }
    getStream(id) {
        for (let stream of this.streams) {
            if (stream.id == id)
                return stream;
        }
        return null;
    }
}
class SnapControl {
    constructor(baseUrl) {
        this.server = new Server();
        this.baseUrl = baseUrl;
        this.msg_id = 0;
        this.status_req_id = -1;
        this.connect();
    }
    connect() {
        this.connection = new WebSocket(this.baseUrl + '/jsonrpc');
        this.connection.onmessage = (msg) => this.onMessage(msg.data);
        this.connection.onopen = () => { this.status_req_id = this.sendRequest('Server.GetStatus'); };
        this.connection.onerror = (ev) => { console.error('error:', ev); };
        this.connection.onclose = () => {
            console.info('connection lost, reconnecting in 1s');
            setTimeout(() => this.connect(), 1000);
        };
    }
    mergeStreamProperties(targetServer, previousServer) {
        if (!targetServer || !targetServer.streams || !previousServer || !previousServer.streams)
            return;
        let previousById = {};
        for (let stream of previousServer.streams) {
            previousById[stream.id] = stream;
        }
        for (let stream of targetServer.streams) {
            let oldStream = previousById[stream.id];
            if (!oldStream)
                continue;
            stream.updateProperties(oldStream.properties);
        }
    }
    action(answer) {
        switch (answer.method) {
            case 'Client.OnVolumeChanged':
                let client = this.getClient(answer.params.id);
                client.config.volume = answer.params.volume;
                updateGroupVolume(this.getGroupFromClient(client.id));
                break;
            case 'Client.OnLatencyChanged':
                this.getClient(answer.params.id).config.latency = answer.params.latency;
                break;
            case 'Client.OnNameChanged':
                this.getClient(answer.params.id).config.name = answer.params.name;
                break;
            case 'Client.OnConnect':
            case 'Client.OnDisconnect':
                this.getClient(answer.params.client.id).fromJson(answer.params.client);
                break;
            case 'Group.OnMute':
                this.getGroup(answer.params.id).muted = Boolean(answer.params.mute);
                break;
            case 'Group.OnNameChanged':
                this.getGroup(answer.params.id).name = answer.params.name;
                break;
            case 'Group.OnStreamChanged':
                this.getGroup(answer.params.id).stream_id = answer.params.stream_id;
                break;
            case 'Stream.OnUpdate':
                this.getStream(answer.params.id).fromJson(answer.params.stream);
                break;
            case 'Stream.OnProperties':
                this.getStream(answer.params.id).updateProperties(answer.params);
                break;
            case 'Server.OnUpdate':
                let previousServer = this.server;
                this.server.fromJson(answer.params.server);
                this.mergeStreamProperties(this.server, previousServer);
                break;
            default:
                break;
        }
    }
    getClient(client_id) {
        let client = this.server.getClient(client_id);
        if (client == null) {
            throw new Error(`client ${client_id} was null`);
        }
        return client;
    }
    getGroup(group_id) {
        let group = this.server.getGroup(group_id);
        if (group == null) {
            throw new Error(`group ${group_id} was null`);
        }
        return group;
    }
    getGroupVolume(group, online) {
        if (group.clients.length == 0)
            return 0;
        let group_vol = 0;
        let client_count = 0;
        for (let client of group.clients) {
            if (online && !client.connected)
                continue;
            group_vol += client.config.volume.percent;
            ++client_count;
        }
        if (client_count == 0)
            return 0;
        return group_vol / client_count;
    }
    getGroupFromClient(client_id) {
        for (let group of this.server.groups)
            for (let client of group.clients)
                if (client.id == client_id)
                    return group;
        throw new Error(`group for client ${client_id} was null`);
    }
    getStream(stream_id) {
        let stream = this.server.getStream(stream_id);
        if (stream == null) {
            throw new Error(`stream ${stream_id} was null`);
        }
        return stream;
    }
    setVolume(client_id, percent, mute) {
        percent = Math.max(0, Math.min(100, percent));
        let client = this.getClient(client_id);
        client.config.volume.percent = percent;
        if (mute != undefined)
            client.config.volume.muted = mute;
        this.sendRequest('Client.SetVolume', { id: client_id, volume: { muted: client.config.volume.muted, percent: client.config.volume.percent } });
    }
    setClientName(client_id, name) {
        let client = this.getClient(client_id);
        let current_name = (client.config.name != "") ? client.config.name : client.host.name;
        if (name != current_name) {
            this.sendRequest('Client.SetName', { id: client_id, name: name });
            client.config.name = name;
        }
    }
    setClientLatency(client_id, latency) {
        let client = this.getClient(client_id);
        let current_latency = client.config.latency;
        if (latency != current_latency) {
            this.sendRequest('Client.SetLatency', { id: client_id, latency: latency });
            client.config.latency = latency;
        }
    }
    deleteClient(client_id) {
        this.sendRequest('Server.DeleteClient', { id: client_id });
        this.server.groups.forEach((g, gi) => {
            g.clients.forEach((c, ci) => {
                if (c.id == client_id) {
                    this.server.groups[gi].clients.splice(ci, 1);
                }
            });
        });
        this.server.groups.forEach((g, gi) => {
            if (g.clients.length == 0) {
                this.server.groups.splice(gi, 1);
            }
        });
        show();
    }
    setStream(group_id, stream_id) {
        this.getGroup(group_id).stream_id = stream_id;
        this.sendRequest('Group.SetStream', { id: group_id, stream_id: stream_id });
    }
    setGroupName(group_id, name) {
        this.getGroup(group_id).name = name;
        this.sendRequest('Group.SetName', { id: group_id, name: name });
    }
    setClients(group_id, clients) {
        this.status_req_id = this.sendRequest('Group.SetClients', { id: group_id, clients: clients });
    }
    muteGroup(group_id, mute) {
        this.getGroup(group_id).muted = mute;
        this.sendRequest('Group.SetMute', { id: group_id, mute: mute });
    }
    sendRequest(method, params) {
        let msg = {
            id: ++this.msg_id,
            jsonrpc: '2.0',
            method: method
        };
        if (params)
            msg.params = params;
        let msgJson = JSON.stringify(msg);
        console.log("Sending: " + msgJson);
        this.connection.send(msgJson);
        return this.msg_id;
    }
    onMessage(msg) {
        let answer = JSON.parse(msg);
        let is_response = (answer.id != undefined);
        console.log("Received " + (is_response ? "response" : "notification") + ", json: " + JSON.stringify(answer));
        if (is_response) {
            if (answer.id == this.status_req_id) {
                let previousServer = this.server;
                this.server = new Server(answer.result.server);
                this.mergeStreamProperties(this.server, previousServer);
                show();
            }
        }
        else {
            if (Array.isArray(answer)) {
                for (let a of answer) {
                    this.action(a);
                }
            }
            else {
                this.action(answer);
            }
            // TODO: don't update everything, but only the changed, 
            // e.g. update the values for the volume sliders
            show();
        }
    }
}
let snapcontrol;
let snapstream = null;
let hide_offline = true;
let autoplay_done = false;
let lastPlayToggleTs = 0;
let pendingWebAttachStreamId = null;
let pendingWebAttachAttempts = 0;
const STREAM_METADATA_IDLE_TIMEOUT_MS = 30000;
let streamIdleSinceMs = {};
let idleMetadataRefreshTimer = null;
function autoplayRequested() {
    return document.location.hash.match(/autoplay/) !== null;
}
function getPreferredPlayingStreamId() {
    if (!snapcontrol || !snapcontrol.server || !snapcontrol.server.streams)
        return "";
    let nowPlaying = getNowPlaying(snapcontrol.server);
    if (nowPlaying && nowPlaying.stream && nowPlaying.stream.id)
        return nowPlaying.stream.id;
    for (let stream of snapcontrol.server.streams) {
        if (stream.status === "playing")
            return stream.id;
    }
    return "";
}
function getCurrentWebClientId() {
    try {
        if (typeof getPersistentValue === "function")
            return getPersistentValue("uniqueId", "");
    }
    catch (_) {
    }
    return "";
}
function resolveCurrentWebClient() {
    if (!snapcontrol || !snapcontrol.server)
        return null;
    let preferredId = getCurrentWebClientId();
    if (preferredId) {
        let exact = snapcontrol.server.getClient(preferredId);
        if (exact)
            return exact;
    }
    let connectedWebClients = [];
    for (let group of snapcontrol.server.groups) {
        for (let client of group.clients) {
            if (client.connected && client.host && client.host.arch === "web")
                connectedWebClients.push(client);
        }
    }
    if (connectedWebClients.length === 1)
        return connectedWebClients[0];
    return null;
}
function maybeAutoAttachCurrentWebClient() {
    if (!snapstream || !pendingWebAttachStreamId || pendingWebAttachAttempts <= 0 || !snapcontrol)
        return;
    pendingWebAttachAttempts -= 1;
    let client = resolveCurrentWebClient();
    if (client && client.connected) {
        try {
            let group = snapcontrol.getGroupFromClient(client.id);
            if (group.stream_id !== pendingWebAttachStreamId) {
                snapcontrol.setStream(group.id, pendingWebAttachStreamId);
                snapcontrol.status_req_id = snapcontrol.sendRequest('Server.GetStatus');
            }
            pendingWebAttachStreamId = null;
            pendingWebAttachAttempts = 0;
            return;
        }
        catch (_) {
        }
    }
    if (pendingWebAttachAttempts > 0) {
        snapcontrol.status_req_id = snapcontrol.sendRequest('Server.GetStatus');
        setTimeout(maybeAutoAttachCurrentWebClient, 350);
    }
}
function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function normalizeArtUrl(url) {
    if (!url)
        return "";
    // Some streams expose artUrl with the server hostname (e.g. "Outdoor"),
    // which might not resolve on mobile clients. Rebase Snapserver cache URLs
    // to the current origin host so album art loads consistently.
    let snapCachePos = url.indexOf("/__image_cache");
    if (snapCachePos >= 0) {
        return window.location.protocol + "//" + window.location.host + url.substring(snapCachePos);
    }
    return url;
}
function normalizeMetadataText(value) {
    if (Array.isArray(value))
        return value.map((v) => String(v).trim()).filter((v) => v.length > 0).join(", ");
    if (value == null)
        return "";
    return String(value).trim();
}
function getMetadataCoverUrl(metadata) {
    if (!metadata)
        return "";
    let candidates = [
        metadata.artUrl,
        metadata.coverUrl,
        metadata.cover_url,
        metadata.artworkUrl,
        metadata.image
    ];
    for (let candidate of candidates) {
        let url = normalizeMetadataText(candidate);
        if (url)
            return normalizeArtUrl(url);
    }
    return "";
}
function updateStreamIdleTracking(server) {
    if (!server || !server.streams)
        return;
    let now = Date.now();
    let liveIds = {};
    for (let stream of server.streams) {
        let id = String(stream.id || "");
        liveIds[id] = true;
        if (stream.status === "playing") {
            delete streamIdleSinceMs[id];
        }
        else if (streamIdleSinceMs[id] == null) {
            streamIdleSinceMs[id] = now;
        }
    }
    for (let id in streamIdleSinceMs) {
        if (!liveIds[id])
            delete streamIdleSinceMs[id];
    }
}
function isStreamMetadataStale(stream) {
    if (!stream || stream.status === "playing")
        return false;
    let id = String(stream.id || "");
    let since = streamIdleSinceMs[id];
    if (since == null)
        return false;
    return (Date.now() - since) >= STREAM_METADATA_IDLE_TIMEOUT_MS;
}
function scheduleIdleMetadataRefresh(server) {
    if (idleMetadataRefreshTimer) {
        clearTimeout(idleMetadataRefreshTimer);
        idleMetadataRefreshTimer = null;
    }
    if (!server || !server.streams)
        return;
    let now = Date.now();
    let nextDelayMs = null;
    for (let stream of server.streams) {
        if (!stream || stream.status === "playing")
            continue;
        let id = String(stream.id || "");
        let since = streamIdleSinceMs[id];
        if (since == null)
            continue;
        let remaining = STREAM_METADATA_IDLE_TIMEOUT_MS - (now - since);
        if (remaining > 0 && (nextDelayMs == null || remaining < nextDelayMs)) {
            nextDelayMs = remaining;
        }
    }
    if (nextDelayMs != null) {
        idleMetadataRefreshTimer = setTimeout(() => show(), nextDelayMs + 60);
    }
}
function isPrunableStaleClient(client) {
    if (!client || client.connected)
        return false;
    let id = String(client.id == null ? "" : client.id).trim();
    return id.length > 0;
}
function getNowPlaying(server) {
    if (!server || !server.streams || server.streams.length === 0)
        return null;
    let scored = [];
    for (let stream of server.streams) {
        let metadata = stream.metadata || {};
        let stale = isStreamMetadataStale(stream);
        let title = normalizeMetadataText(metadata.title || metadata.track || metadata.name);
        let artist = normalizeMetadataText(metadata.artist || metadata.albumArtist || metadata.performer);
        let album = normalizeMetadataText(metadata.album);
        let artUrl = getMetadataCoverUrl(metadata);
        if (stale) {
            title = "";
            artist = "";
            album = "";
            artUrl = "";
        }
        let hasMetadata = title !== "" || artist !== "" || album !== "" || artUrl !== "";
        let score = 0;
        if (stream.status === "playing")
            score += 100;
        if (String(stream.id || "").toLowerCase().includes("spotify"))
            score += 40;
        if (hasMetadata)
            score += 20;
        scored.push({ stream, title, artist, album, artUrl, hasMetadata, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0];
}
function buildStreamMetadataView(stream) {
    let metadata = stream.metadata || {};
    let stale = isStreamMetadataStale(stream);
    let title = normalizeMetadataText(metadata.title || metadata.track || metadata.name);
    let artist = normalizeMetadataText(metadata.artist || metadata.albumArtist || metadata.performer);
    let album = normalizeMetadataText(metadata.album);
    let artUrl = getMetadataCoverUrl(metadata);
    if (stale) {
        title = "Waiting for metadata";
        artist = "";
        album = "";
        artUrl = "";
    }
    let hasMetadata = title !== "" || artist !== "" || album !== "" || artUrl !== "";
    return { title, artist, album, artUrl, hasMetadata };
}
function show() {
    // Render the page
    const versionElem = document.getElementsByTagName("meta").namedItem("version");
    console.log("Snapweb version " + (versionElem ? versionElem.content : "null"));
    let play_img;
    if (snapstream) {
        play_img = 'stop.png';
    }
    else {
        play_img = 'play.png';
    }
    let content = "";
    content += "<div class='navbar'>";
    content += "  <div class='navbar-left'>Rezon<img src='8-ball_6262.png' class='eight-ball' id='eight-ball' /></div>";
    content += "  <div class='navbar-actions'>";
    let serverVersion = snapcontrol.server.server.snapserver.version.split('.');
    if ((serverVersion.length >= 2) && (+serverVersion[1] >= 21)) {
        content += "    <img src='" + play_img + "' class='play-button' id='play-button' />";
        // Stream became ready and was not playing. If autoplay is requested, start playing.
        if (!snapstream && !autoplay_done && autoplayRequested()) {
            autoplay_done = true;
            play();
        }
    }
    content += "  </div>";
    content += "</div>";
    content += "<div class='content'>";
    let server = snapcontrol.server;
    updateStreamIdleTracking(server);
    scheduleIdleMetadataRefresh(server);
    let nowPlaying = getNowPlaying(server);
    let streamOptionsFor = (selectedId) => {
        let html = "";
        for (let s of server.streams) {
            let selected = (s.id === selectedId) ? "selected" : "";
            html += "<option value='" + s.id + "' " + selected + ">" + s.id + ": " + s.status + "</option>";
        }
        return html;
    };
    if (nowPlaying) {
        content += "<div class='now-playing-card'>";
        if (nowPlaying.artUrl) {
            content += "<img class='now-playing-art' src='" + escapeHtml(nowPlaying.artUrl) + "' alt='Cover art' onerror=\"this.style.display='none';if(this.nextElementSibling){this.nextElementSibling.style.display='flex';}\">";
            content += "<div class='now-playing-art now-playing-art-fallback now-playing-art-fallback-hidden' aria-hidden='true'>&#9835;</div>";
        }
        else {
            content += "<div class='now-playing-art now-playing-art-fallback' aria-hidden='true'>&#9835;</div>";
        }
        content += "<div class='now-playing-content'>";
        content += "<div class='now-playing-kicker'>Now Playing - " + escapeHtml(nowPlaying.stream.id) + "</div>";
        content += "<div class='now-playing-title'>" + escapeHtml(nowPlaying.title || "Waiting for metadata") + "</div>";
        content += "<div class='now-playing-subtitle'>" + escapeHtml(nowPlaying.artist || "Waiting for stream metadata") + "</div>";
        if (nowPlaying.album) {
            content += "<div class='now-playing-album'>" + escapeHtml(nowPlaying.album) + "</div>";
        }
        content += "</div>";
        content += "</div>";
    }
    content += "<div class='stream-overview'>";
    content += "<div class='stream-overview-title'>Streams</div>";
    for (let s of snapcontrol.server.streams) {
        let sClass = (s.status === "playing") ? "stream-pill playing" : "stream-pill";
        content += "<span class='" + sClass + "'>" + s.id + ": " + s.status + "</span>";
        let streamMeta = buildStreamMetadataView(s);
        if (streamMeta.hasMetadata) {
            content += "<div class='stream-meta-card'>";
            if (streamMeta.artUrl) {
                content += "<img class='stream-meta-art' src='" + escapeHtml(streamMeta.artUrl) + "' alt='Stream cover art' onerror=\"this.style.display='none';if(this.nextElementSibling){this.nextElementSibling.style.display='flex';}\">";
                content += "<div class='stream-meta-art stream-meta-art-fallback stream-meta-art-fallback-hidden' aria-hidden='true'>&#9835;</div>";
            }
            else {
                content += "<div class='stream-meta-art stream-meta-art-fallback' aria-hidden='true'>&#9835;</div>";
            }
            content += "<div class='stream-meta-body'>";
            content += "<div class='stream-meta-title'>" + escapeHtml(streamMeta.title || "Unknown title") + "</div>";
            if (streamMeta.artist) {
                content += "<div class='stream-meta-artist'>" + escapeHtml(streamMeta.artist) + "</div>";
            }
            if (streamMeta.album) {
                content += "<div class='stream-meta-album'>" + escapeHtml(streamMeta.album) + "</div>";
            }
            content += "</div>";
            content += "</div>";
        }
    }
    content += "</div>";
    let staleClientCount = 0;
    for (let g of server.groups) {
        for (let c of g.clients) {
            if (isPrunableStaleClient(c)) {
                staleClientCount += 1;
            }
        }
    }
    content += "<div class='groupings-panel'>";
    content += "  <div class='groupings-head'>";
    content += "    <div class='groupings-title'>Existing Groupings</div>";
    content += "    <button class='grouping-prune-btn' onclick='pruneStaleClients()'>Prune Groups (" + staleClientCount + ")</button>";
    content += "  </div>";
    for (let i = 0; i < server.groups.length; i++) {
        let g = server.groups[i];
        let gName = g.name && g.name !== "" ? g.name : ("Group " + (i + 1));
        content += "  <div class='grouping-item'>";
        content += "    <div class='grouping-header'>";
        content += "      <div class='grouping-name'>" + gName + "</div>";
        content += "      <button class='grouping-edit-btn' onclick=\"renameGroup('" + g.id + "')\">Edit</button>";
        content += "    </div>";
        content += "    <div class='grouping-meta'>" + g.clients.length + " client(s)</div>";
        content += "    <div class='grouping-controls'>";
        content += "      <label class='grouping-label'>Stream Source</label>";
        content += "      <select id='grouping_stream_" + g.id + "' class='grouping-stream-select' onchange=\"setGroupingStream('" + g.id + "')\">";
        content += streamOptionsFor(g.stream_id);
        content += "      </select>";
        content += "    </div>";
        content += "    <div class='grouping-actions'>";
        content += "      <button class='grouping-action-btn' onclick=\"ungroupAllClients('" + g.id + "')\">Ungroup All</button>";
        if (g.clients.length > 1) {
            content += "      <button class='grouping-action-btn grouping-action-danger' onclick=\"dissolveGroup('" + g.id + "')\">Dissolve Group</button>";
        }
        content += "    </div>";
        content += "  </div>";
    }
    content += "</div>";
    for (let group of server.groups) {
        if (hide_offline) {
            let groupActive = false;
            for (let client of group.clients) {
                if (client.connected) {
                    groupActive = true;
                    break;
                }
            }
            if (!groupActive)
                continue;
        }
        // Set mute variables
        let classgroup;
        let muted;
        let mute_img;
        if (group.muted == true) {
            classgroup = 'group muted';
            muted = true;
            mute_img = 'mute_icon.png';
        }
        else {
            classgroup = 'group';
            muted = false;
            mute_img = 'speaker_icon.png';
        }
        // Start group div
        content += "<div id='g_" + group.id + "' class='" + classgroup + "'>";
        // Create stream selection dropdown
        let streamselect = "<select id='stream_" + group.id + "' onchange='setStream(\"" + group.id + "\")' class='stream'>";
        for (let i_stream = 0; i_stream < server.streams.length; i_stream++) {
            let streamselected = "";
            if (group.stream_id == server.streams[i_stream].id) {
                streamselected = 'selected';
            }
            streamselect += "<option value='" + server.streams[i_stream].id + "' " + streamselected + ">" + server.streams[i_stream].id + ": " + server.streams[i_stream].status + "</option>";
        }
        streamselect += "</select>";
        // Group mute and refresh button
        content += "<div class='groupheader'>";
        content += streamselect;
        let clientCount = 0;
        for (let client of group.clients)
            if (!hide_offline || client.connected)
                clientCount++;
        if (clientCount > 1) {
            let volume = snapcontrol.getGroupVolume(group, hide_offline);
            content += "<a href=\"javascript:setMuteGroup('" + group.id + "'," + !muted + ");\"><img src='" + mute_img + "' class='mute-button'></a>";
            content += "<div class='slidergroupdiv'>";
            content += "    <input type='range' draggable='false' min=0 max=100 step=1 id='vol_" + group.id + "' oninput='javascript:setGroupVolume(\"" + group.id + "\")' value=" + volume + " class='slider'>";
            // content += "    <input type='range' min=0 max=100 step=1 id='vol_" + group.id + "' oninput='javascript:setVolume(\"" + client.id + "\"," + client.config.volume.muted + ")' value=" + client.config.volume.percent + " class='" + sliderclass + "'>";
            content += "</div>";
        }
        // transparent placeholder edit icon
        content += "<div class='edit-group-icon'>&#9998</div>";
        content += "</div>";
        content += "<hr class='groupheader-separator'>";
        // Create clients in group
        for (let client of group.clients) {
            if (!client.connected && hide_offline)
                continue;
            // Set name and connection state vars, start client div
            let name;
            let clas = 'client';
            if (client.config.name != "") {
                name = client.config.name;
            }
            else {
                name = client.host.name;
            }
            if (client.connected == false) {
                clas = 'client disconnected';
            }
            content += "<div id='c_" + client.id + "' class='" + clas + "'>";
            // Client mute status vars
            let muted;
            let mute_img;
            let sliderclass;
            if (client.config.volume.muted == true) {
                muted = true;
                sliderclass = 'slider muted';
                mute_img = 'mute_icon.png';
            }
            else {
                sliderclass = 'slider';
                muted = false;
                mute_img = 'speaker_icon.png';
            }
            // Populate client div
            content += "<a href=\"javascript:setVolume('" + client.id + "'," + !muted + ");\"><img src='" + mute_img + "' class='mute-button'></a>";
            content += "    <div class='sliderdiv'>";
            content += "        <input type='range' min=0 max=100 step=1 id='vol_" + client.id + "' oninput='javascript:setVolume(\"" + client.id + "\"," + client.config.volume.muted + ")' value=" + client.config.volume.percent + " class='" + sliderclass + "'>";
            content += "    </div>";
            content += "    <span class='edit-icons'>";
            content += "        <a href=\"javascript:openClientSettings('" + client.id + "');\" class='edit-icon'>&#9998</a>";
            if (client.connected == false) {
                content += "      <a href=\"javascript:deleteClient('" + client.id + "');\" class='delete-icon'>&#128465</a>";
                content += "   </span>";
            }
            else {
                content += "</span>";
            }
            content += "    <div class='name' onclick=\"openClientSettings('" + client.id + "')\">" + name + "</div>";
            content += "    <div class='client-stream-attach'>";
            content += "      <label class='client-stream-label' for='attach_stream_" + client.id + "'>Attach Source</label>";
            content += "      <select id='attach_stream_" + client.id + "' class='client-stream-select'>";
            content += streamOptionsFor(group.stream_id);
            content += "      </select>";
            content += "      <button class='client-attach-btn' onclick=\"attachClientToStream('" + client.id + "')\">Attach</button>";
            content += "      <button class='client-attach-btn client-ungroup-btn' onclick=\"ungroupClient('" + client.id + "')\">Ungroup</button>";
            content += "    </div>";
            content += "</div>";
        }
        content += "</div>";
    }
    content += "</div>"; // content
    content += "<div id='client-settings' class='client-settings'>";
    content += "    <div class='client-setting-content'>";
    content += "      <div class='client-modal-header'>";
    content += "        <div>";
    content += "          <div class='client-modal-title'>Edit Client</div>";
    content += "          <div id='client-meta' class='client-meta'></div>";
    content += "        </div>";
    content += "        <button type='button' class='modal-close-btn' onclick='cancelClientSettings()' aria-label='Close'>&times;</button>";
    content += "      </div>";
    content += "      <form class='client-form' action='javascript:closeClientSettings()'>";
    content += "        <label for='client-name'>Name</label>";
    content += "        <input type='text' class='client-input' id='client-name' name='client-name' placeholder='Client name'>";
    content += "        <label for='client-latency'>Latency (ms)</label>";
    content += "        <input type='number' class='client-input' min='-10000' max='10000' id='client-latency' name='client-latency' placeholder='Latency in ms'>";
    content += "        <label for='client-group'>Group</label>";
    content += "        <select id='client-group' class='client-input' name='client-group'></select>";
    content += "        <div class='client-actions'>";
    content += "          <button type='button' class='modal-btn modal-btn-secondary' onclick='cancelClientSettings()'>Cancel</button>";
    content += "          <button type='submit' class='modal-btn modal-btn-primary'>Save</button>";
    content += "        </div>";
    content += "      </form>";
    content += "    </div>";
    content += "</div>";
    content += "<div id='group-settings' class='client-settings'>";
    content += "    <div class='client-setting-content'>";
    content += "      <div class='client-modal-header'>";
    content += "        <div class='client-modal-title'>Edit Group</div>";
    content += "        <button type='button' class='modal-close-btn' onclick='cancelGroupSettings()' aria-label='Close'>&times;</button>";
    content += "      </div>";
    content += "      <form class='client-form' action='javascript:closeGroupSettings()'>";
    content += "        <input type='hidden' id='group-name-id'>";
    content += "        <label for='group-name'>Group Name</label>";
    content += "        <input type='text' class='client-input' id='group-name' name='group-name' placeholder='Group name'>";
    content += "        <div class='client-actions'>";
    content += "          <button type='button' class='modal-btn modal-btn-secondary' onclick='cancelGroupSettings()'>Cancel</button>";
    content += "          <button type='submit' class='modal-btn modal-btn-primary'>Save</button>";
    content += "        </div>";
    content += "      </form>";
    content += "    </div>";
    content += "</div>";
    // Pad then update page
    content = content + "<br><br>";
    document.getElementById('show').innerHTML = content;
    let playElem = document.getElementById('play-button');
    if (playElem) {
        let onPlayTap = (ev) => {
            if (ev)
                ev.preventDefault();
            let now = Date.now();
            if (now - lastPlayToggleTs < 450)
                return;
            lastPlayToggleTs = now;
            play();
        };
        playElem.onclick = onPlayTap;
        playElem.ontouchstart = onPlayTap;
    }
    maybeAutoAttachCurrentWebClient();
    for (let group of snapcontrol.server.groups) {
        if (group.clients.length > 1) {
            let slider = document.getElementById("vol_" + group.id);
            if (slider == null)
                continue;
            slider.addEventListener('pointerdown', function () {
                groupVolumeEnter(group.id);
            });
            slider.addEventListener('touchstart', function () {
                groupVolumeEnter(group.id);
            });
        }
    }
}
function updateGroupVolume(group) {
    let group_vol = snapcontrol.getGroupVolume(group, hide_offline);
    let slider = document.getElementById("vol_" + group.id);
    if (slider == null)
        return;
    console.log("updateGroupVolume group: " + group.id + ", volume: " + group_vol + ", slider: " + (slider != null));
    slider.value = String(group_vol);
}
let client_volumes;
let group_volume;
function setGroupVolume(group_id) {
    let group = snapcontrol.getGroup(group_id);
    let percent = document.getElementById('vol_' + group.id).valueAsNumber;
    console.log("setGroupVolume id: " + group.id + ", volume: " + percent);
    // show()
    let delta = percent - group_volume;
    let ratio;
    if (delta < 0)
        ratio = (group_volume - percent) / group_volume;
    else
        ratio = (percent - group_volume) / (100 - group_volume);
    for (let i = 0; i < group.clients.length; ++i) {
        let new_volume = client_volumes[i];
        if (delta < 0)
            new_volume -= ratio * client_volumes[i];
        else
            new_volume += ratio * (100 - client_volumes[i]);
        let client_id = group.clients[i].id;
        // TODO: use batch request to update all client volumes at once
        snapcontrol.setVolume(client_id, new_volume);
        let slider = document.getElementById('vol_' + client_id);
        if (slider)
            slider.value = String(new_volume);
    }
}
function groupVolumeEnter(group_id) {
    let group = snapcontrol.getGroup(group_id);
    let percent = document.getElementById('vol_' + group.id).valueAsNumber;
    console.log("groupVolumeEnter id: " + group.id + ", volume: " + percent);
    group_volume = percent;
    client_volumes = [];
    for (let i = 0; i < group.clients.length; ++i) {
        client_volumes.push(group.clients[i].config.volume.percent);
    }
    // show()
}
function setVolume(id, mute) {
    console.log("setVolume id: " + id + ", mute: " + mute);
    let percent = document.getElementById('vol_' + id).valueAsNumber;
    let client = snapcontrol.getClient(id);
    let needs_update = (mute != client.config.volume.muted);
    snapcontrol.setVolume(id, percent, mute);
    let group = snapcontrol.getGroupFromClient(id);
    updateGroupVolume(group);
    if (needs_update)
        show();
}
function play() {
    try {
        if (snapstream) {
            // On iOS Safari, treat play tap as an unlock action if audio context is suspended.
            if (typeof snapstream.isSuspended === "function" && snapstream.isSuspended()) {
                if (typeof snapstream.ensureAudioUnlockedDirect === "function")
                    snapstream.ensureAudioUnlockedDirect();
                else
                    snapstream.ensureAudioUnlocked();
                show();
                return;
            }
            snapstream.stop();
            snapstream = null;
        }
        else {
            if (!config || !config.baseUrl) {
                throw new Error("Missing stream base URL");
            }
            pendingWebAttachStreamId = getPreferredPlayingStreamId();
            pendingWebAttachAttempts = pendingWebAttachStreamId ? 20 : 0;
            snapstream = new SnapStream(config.baseUrl);
            if (typeof snapstream.ensureAudioUnlockedDirect === "function")
                snapstream.ensureAudioUnlockedDirect();
            else
                snapstream.ensureAudioUnlocked();
            if (pendingWebAttachAttempts > 0) {
                setTimeout(maybeAutoAttachCurrentWebClient, 300);
            }
        }
    }
    catch (err) {
        console.error("Play toggle failed:", err);
        alert("Unable to start web audio playback. Please reload Snapweb once and try again.");
        snapstream = null;
    }
    show();
}
function setMuteGroup(id, mute) {
    snapcontrol.muteGroup(id, mute);
    show();
}
function setStream(id) {
    snapcontrol.setStream(id, document.getElementById('stream_' + id).value);
    show();
}
function setGroupingStream(group_id) {
    let elem = document.getElementById('grouping_stream_' + group_id);
    if (!elem)
        return;
    snapcontrol.setStream(group_id, elem.value);
    show();
}
function renameGroup(group_id) {
    openGroupSettings(group_id);
}
function openGroupSettings(group_id) {
    let modal = document.getElementById("group-settings");
    let group = snapcontrol.getGroup(group_id);
    let current = (group.name && group.name !== "") ? group.name : "Group";
    let groupIdInput = document.getElementById("group-name-id");
    let groupNameInput = document.getElementById("group-name");
    if (!modal || !groupIdInput || !groupNameInput)
        return;
    groupIdInput.value = group_id;
    groupNameInput.value = current;
    modal.style.display = "block";
    groupNameInput.focus();
    groupNameInput.select();
}
function cancelGroupSettings() {
    let modal = document.getElementById("group-settings");
    if (modal)
        modal.style.display = "none";
}
function closeGroupSettings() {
    let modal = document.getElementById("group-settings");
    let groupIdInput = document.getElementById("group-name-id");
    let groupNameInput = document.getElementById("group-name");
    if (!groupIdInput || !groupNameInput)
        return;
    let group_id = groupIdInput.value;
    let next = groupNameInput.value.trim();
    if (next.length === 0) {
        alert("Group name cannot be empty.");
        return;
    }
    snapcontrol.setGroupName(group_id, next);
    snapcontrol.status_req_id = snapcontrol.sendRequest('Server.GetStatus');
    if (modal)
        modal.style.display = "none";
    show();
}
function renameGroupLegacyPrompt(group_id) {
    let group = snapcontrol.getGroup(group_id);
    let current = (group.name && group.name !== "") ? group.name : "Group";
    let next = window.prompt("Group Name", current);
    if (next == null)
        return;
    snapcontrol.setGroupName(group_id, next);
    show();
}
function ungroupAllClients(group_id) {
    let group = snapcontrol.getGroup(group_id);
    if (!group)
        return;
    if (group.clients.length <= 1) {
        alert("This group has only one client. Nothing to ungroup.");
        return;
    }
    if (!confirm("Ungroup all clients in this group?")) {
        return;
    }
    dissolveGroup(group_id);
}
function dissolveGroup(group_id) {
    let group = snapcontrol.getGroup(group_id);
    if (!group)
        return;
    if (group.clients.length <= 1) {
        return;
    }
    if (!confirm("Dissolve this group into individual client groups?")) {
        return;
    }
    var originalStreamId = group.stream_id;
    var originalGroupId = group.id;
    var clientIds = group.clients.map((c) => c.id);
    var idx = 1;
    function step() {
        if (idx >= clientIds.length) {
            snapcontrol.status_req_id = snapcontrol.sendRequest('Server.GetStatus');
            return;
        }
        var clientId = clientIds[idx];
        setGroup(clientId, "new");
        var attemptsLeft = 15;
        function applyStreamThenNext() {
            snapcontrol.status_req_id = snapcontrol.sendRequest('Server.GetStatus');
            setTimeout(function () {
                try {
                    var updatedGroup = snapcontrol.getGroupFromClient(clientId);
                    var detached = updatedGroup.id !== originalGroupId;
                    if (detached) {
                        if (originalStreamId) {
                            snapcontrol.setStream(updatedGroup.id, originalStreamId);
                        }
                        idx += 1;
                        setTimeout(step, 350);
                        return;
                    }
                } catch (_) { }
                attemptsLeft -= 1;
                if (attemptsLeft <= 0) {
                    snapcontrol.status_req_id = snapcontrol.sendRequest('Server.GetStatus');
                    alert("Dissolve timed out. Please retry.");
                    return;
                }
                setTimeout(applyStreamThenNext, 200);
            }, 180);
        }
        applyStreamThenNext();
    }
    step();
}
function setGroup(client_id, group_id) {
    console.log("setGroup id: " + client_id + ", group: " + group_id);
    let server = snapcontrol.server;
    // Get client group id
    let current_group = snapcontrol.getGroupFromClient(client_id);
    // Get
    //   List of target group's clients
    // OR
    //   List of current group's other clients
    let send_clients = [];
    for (let i_group = 0; i_group < server.groups.length; i_group++) {
        if (server.groups[i_group].id == group_id || (group_id == "new" && server.groups[i_group].id == current_group.id)) {
            for (let i_client = 0; i_client < server.groups[i_group].clients.length; i_client++) {
                if (group_id == "new" && server.groups[i_group].clients[i_client].id == client_id) { }
                else {
                    send_clients[send_clients.length] = server.groups[i_group].clients[i_client].id;
                }
            }
        }
    }
    if (group_id == "new")
        group_id = current_group.id;
    else
        send_clients[send_clients.length] = client_id;
    snapcontrol.setClients(group_id, send_clients);
}
function attachClientToStream(client_id) {
    let selector = document.getElementById('attach_stream_' + client_id);
    if (!selector)
        return;
    let targetStreamId = selector.value;
    let currentGroup = snapcontrol.getGroupFromClient(client_id);
    if (currentGroup.clients.length <= 1) {
        snapcontrol.setStream(currentGroup.id, targetStreamId);
        show();
        return;
    }
    // Split to a dedicated group first, then assign stream once state catches up.
    setGroup(client_id, "new");
    let previousGroupId = currentGroup.id;
    let attemptsLeft = 12;
    let applyStreamToDetachedClient = function () {
        snapcontrol.status_req_id = snapcontrol.sendRequest('Server.GetStatus');
        setTimeout(function () {
            try {
                let updatedGroup = snapcontrol.getGroupFromClient(client_id);
                let detached = updatedGroup.id !== previousGroupId || updatedGroup.clients.length === 1;
                if (detached) {
                    snapcontrol.setStream(updatedGroup.id, targetStreamId);
                    show();
                    return;
                }
            }
            catch (_a) {
            }
            attemptsLeft -= 1;
            if (attemptsLeft <= 0) {
                snapcontrol.status_req_id = snapcontrol.sendRequest('Server.GetStatus');
                alert("Attach timed out. Please retry.");
                return;
            }
            setTimeout(applyStreamToDetachedClient, 220);
        }, 180);
    };
    applyStreamToDetachedClient();
}
function ungroupClient(client_id) {
    let group = snapcontrol.getGroupFromClient(client_id);
    if (group.clients.length <= 1) {
        alert("Client is already in its own group.");
        return;
    }
    setGroup(client_id, "new");
    snapcontrol.status_req_id = snapcontrol.sendRequest('Server.GetStatus');
}
function setName(id) {
    // Get current name and lacency
    let client = snapcontrol.getClient(id);
    let current_name = (client.config.name != "") ? client.config.name : client.host.name;
    let current_latency = client.config.latency;
    let new_name = window.prompt("New Name", current_name);
    let new_latency = Number(window.prompt("New Latency", String(current_latency)));
    if (new_name != null)
        snapcontrol.setClientName(id, new_name);
    if (new_latency != null)
        snapcontrol.setClientLatency(id, new_latency);
    show();
}
function openClientSettings(id) {
    let modal = document.getElementById("client-settings");
    let client = snapcontrol.getClient(id);
    let current_name = (client.config.name != "") ? client.config.name : client.host.name;
    let meta = document.getElementById("client-meta");
    if (meta)
        meta.textContent = "ID: " + client.id;
    let name = document.getElementById("client-name");
    name.name = id;
    name.value = current_name;
    let latency = document.getElementById("client-latency");
    latency.valueAsNumber = client.config.latency;
    let group = snapcontrol.getGroupFromClient(id);
    let group_input = document.getElementById("client-group");
    while (group_input.length > 0)
        group_input.remove(0);
    let group_num = 0;
    for (let ogroup of snapcontrol.server.groups) {
        let option = document.createElement('option');
        option.value = ogroup.id;
        option.text = "Group " + (group_num + 1) + " (" + ogroup.clients.length + " Clients)";
        group_input.add(option);
        if (ogroup == group) {
            console.log("Selected: " + group_num);
            group_input.selectedIndex = group_num;
        }
        ++group_num;
    }
    let option = document.createElement('option');
    option.value = option.text = "new";
    group_input.add(option);
    modal.style.display = "block";
}
function cancelClientSettings() {
    let modal = document.getElementById("client-settings");
    modal.style.display = "none";
}
function closeClientSettings() {
    let name = document.getElementById("client-name");
    let id = name.name;
    console.log("onclose " + id + ", value: " + name.value);
    snapcontrol.setClientName(id, name.value);
    let latency = document.getElementById("client-latency");
    snapcontrol.setClientLatency(id, latency.valueAsNumber);
    let group_input = document.getElementById("client-group");
    let option = group_input.options[group_input.selectedIndex];
    setGroup(id, option.value);
    let modal = document.getElementById("client-settings");
    modal.style.display = "none";
    show();
}
function deleteClient(id) {
    if (confirm('Are you sure?')) {
        snapcontrol.deleteClient(id);
    }
}
function pruneStaleClients() {
    let staleIds = [];
    for (let group of snapcontrol.server.groups) {
        for (let client of group.clients) {
            if (isPrunableStaleClient(client)) {
                staleIds.push(client.id);
            }
        }
    }
    if (staleIds.length === 0) {
        alert("No stale clients to prune.");
        return;
    }
    if (!confirm("Prune " + staleIds.length + " stale group client(s)?")) {
        return;
    }
    let idx = 0;
    let step = function () {
        if (idx >= staleIds.length) {
            snapcontrol.status_req_id = snapcontrol.sendRequest('Server.GetStatus');
            alert("Pruned " + staleIds.length + " stale group client(s).");
            return;
        }
        snapcontrol.sendRequest('Server.DeleteClient', { id: staleIds[idx] });
        idx += 1;
        setTimeout(step, 120);
    };
    step();
}
window.onload = function () {
    snapcontrol = new SnapControl(config.baseUrl);
};
// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
    let clientModal = document.getElementById("client-settings");
    let groupModal = document.getElementById("group-settings");
    if (event.target == clientModal && clientModal) {
        clientModal.style.display = "none";
    }
    if (event.target == groupModal && groupModal) {
        groupModal.style.display = "none";
    }
};
//# sourceMappingURL=snapcontrol.js.map

console.log("===== CLIENT.JS LOADED =====");

// ====================== CONFIG ======================
let socket = null;
let localStream = null;
let peerConnections = {};
let isMuted = false;
let isCameraOff = false;
let currentRoom = null;
let currentUserName = "";

// ====================== JOIN ROOM ======================
window.joinRoom = async function () {
    const userName = document.getElementById('user-name').value.trim();
    const roomId = document.getElementById('room-id').value.trim();

    if (!userName || !roomId) {
        alert('Please enter both name and room ID');
        return;
    }

    currentUserName = userName;
    currentRoom = roomId;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        socket = io();
        setupSocketListeners();

        socket.on('connect', () => {
            document.getElementById('join-screen').classList.add('hidden');
            document.getElementById('call-screen').classList.remove('hidden');
            document.getElementById('current-room').textContent = roomId;
            document.getElementById('current-user').textContent = userName;

            addVideoStream(socket.id, localStream, userName + ' (You)', true);

            socket.emit('join-room', { roomId, userName });
        });

    } catch (err) {
        console.error('Error:', err);
        alert('Could not access camera/microphone. Please allow permissions.');
    }
};

const remoteNames = {};

function setupSocketListeners() {
    socket.on('existing-users', (users) => {
        users.forEach(user => {
            remoteNames[user.id] = user.name;
            createPeerConnection(user.id, true);
        });
    });

    socket.on('user-joined', (user) => {
        console.log(user.name + ' joined');
        remoteNames[user.id] = user.name;
        createPeerConnection(user.id, false);
    });

    socket.on('user-left', (userId) => {
        if (peerConnections[userId]) {
            peerConnections[userId].close();
            delete peerConnections[userId];
        }
        delete remoteNames[userId];
        const el = document.getElementById(`video-${userId}`);
        if (el) el.remove();
    });

    socket.on('signal', async ({ from, data }) => {
        let pc = peerConnections[from];
        if (!pc) {
            pc = createPeerConnection(from, false);
        }

        if (data.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal', { to: from, data: pc.localDescription });
        } else if (data.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
        } else if (data.candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data));
            } catch (err) {
                console.error(err);
            }
        }
    });
}

function createPeerConnection(remoteSocketId, isInitiator) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnections[remoteSocketId] = pc;

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
        const name = remoteNames[remoteSocketId] || 'Remote User';
        addVideoStream(remoteSocketId, event.streams[0], name);
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', {
                to: remoteSocketId,
                data: event.candidate
            });
        }
    };

    if (isInitiator) {
        pc.onnegotiationneeded = async () => {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('signal', {
                to: remoteSocketId,
                data: pc.localDescription
            });
        };
    }

    return pc;
}

function addVideoStream(id, stream, name, isLocal = false) {
    if (document.getElementById(`video-${id}`)) return;

    const container = document.getElementById('videos');
    const wrapper = document.createElement('div');
    wrapper.className = 'video-container bg-slate-800 rounded-2xl overflow-hidden';
    wrapper.id = `video-${id}`;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;

    const nameTag = document.createElement('div');
    nameTag.className = 'user-name';
    nameTag.textContent = name;

    wrapper.appendChild(video);
    wrapper.appendChild(nameTag);
    container.appendChild(wrapper);
}

window.toggleMute = function () {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
    const btn = document.getElementById('mute-btn');
    btn.textContent = isMuted ? '🔇' : '🎤';
    btn.classList.toggle('bg-red-600', isMuted);
};

window.toggleCamera = function () {
    if (!localStream) return;
    isCameraOff = !isCameraOff;
    localStream.getVideoTracks().forEach(track => track.enabled = !isCameraOff);
    const btn = document.getElementById('camera-btn');
    btn.textContent = isCameraOff ? '📷❌' : '📷';
    btn.classList.toggle('bg-red-600', isCameraOff);
};

window.leaveRoom = function () {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    document.getElementById('call-screen').classList.add('hidden');
    document.getElementById('join-screen').classList.remove('hidden');
    document.getElementById('videos').innerHTML = '';

    if (socket) socket.disconnect();
    location.reload();
};


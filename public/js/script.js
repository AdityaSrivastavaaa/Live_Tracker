const socket = io();

// 🔥 USER PERSISTENCE (NO REPEAT PROMPT)
let username = localStorage.getItem("username");
let color = localStorage.getItem("color");

if (!username) {
    document.getElementById("nameModal").style.display = "flex";
}

// keep same color for identity
if (!color) {
    color = "#" + Math.floor(Math.random() * 16777215).toString(16);
    localStorage.setItem("color", color);
}

let myLocation = null;
let routeLayer = null;
let isFirstLocation = true;
let lastEmitTime = 0;

// 🗺️ MAP INIT (controlled zoom)
const map = L.map("map", {
    minZoom: 10,
    maxZoom: 18
}).setView([20.5937, 78.9629], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
}).addTo(map);

const markers = {};
const users = {};

// 📍 LIVE LOCATION (THROTTLED + INITIAL ZOOM FIX)
navigator.geolocation.watchPosition((pos) => {
    const now = Date.now();

    // ⛔ prevent spamming socket
    if (now - lastEmitTime < 2000) return;
    lastEmitTime = now;

    const { latitude, longitude } = pos.coords;
    myLocation = [latitude, longitude];

    // ✅ FIRST TIME ZOOM FIX
    if (isFirstLocation) {
        map.setView(myLocation, 16);
        isFirstLocation = false;
    }

    socket.emit("send-location", {
        latitude,
        longitude,
        username,
        color
    });

}, console.error, {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0
});
function saveName() {
    const name = document.getElementById("nameInput").value.trim();

    if (!name) {
        alert("Please enter a name");
        return;
    }

    localStorage.setItem("username", name);

    // hide modal
    document.getElementById("nameModal").style.display = "none";

    location.reload(); // reload with saved name
}

// 🔥 GOOGLE-STYLE MARKER
function createAdvancedMarker(lat, lng, username, color, isMe) {
    return L.marker([lat, lng], {
        icon: L.divIcon({
            className: "advanced-marker",
            html: `
                <div class="marker-container">

                    <div class="marker-label-top">
                        ${isMe ? "🟢 You" : username}
                    </div>

                    <div class="marker-pin ${isMe ? "me" : ""}" style="background:${color}">
                        <div class="marker-inner"></div>
                    </div>

                </div>
            `,
            iconSize: [40, 60],
            iconAnchor: [20, 50]
        })
    });
}


// 🔥 RECEIVE LOCATION
socket.on("receive-location", (data) => {
    const { id, latitude, longitude, username, color } = data;

    const latLng = [latitude, longitude];
    users[id] = data;

    const isMe = socket.id === id;

    if (markers[id]) {
        markers[id].setLatLng(latLng);
    } else {
        markers[id] = createAdvancedMarker(
            latitude,
            longitude,
            username,
            color,
            isMe
        ).addTo(map);
    }
});


// 🔥 USER LIST
socket.on("users-list", (allUsers) => {
    const list = document.getElementById("userList");
    list.innerHTML = "";

    Object.entries(allUsers).forEach(([id, user]) => {
        const li = document.createElement("li");

        li.innerText = id === socket.id ? "🟢 You" : user.username;

        li.onclick = () => showRoute(user);

        list.appendChild(li);
    });

    document.getElementById("users").innerText =
        `Users: ${Object.keys(allUsers).length}`;
});


// 🔥 ROUTE FUNCTION (STABLE + CLEAN)
async function showRoute(user) {
    if (!myLocation) return;

    const [lat1, lon1] = myLocation;
    const { latitude: lat2, longitude: lon2 } = user;

    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;

        const res = await fetch(url);
        const data = await res.json();

        if (!data.routes || data.routes.length === 0) return;

        const route = data.routes[0];

        const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

        // remove old route
        if (routeLayer) map.removeLayer(routeLayer);

        routeLayer = L.polyline(coords, {
            color: "#007bff",
            weight: 6
        }).addTo(map);

        // ✅ CONTROLLED ZOOM (NO RANDOM ZOOM OUT)
        map.flyTo([lat2, lon2], 16, {
            duration: 1.5
        });

        // ⏱ ETA
        const minutes = Math.round(route.duration / 60);
        document.getElementById("eta").innerText = `ETA: ${minutes} mins`;

        // 📍 LOCATION NAME
        const placeRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat2}&lon=${lon2}`
        );
        const placeData = await placeRes.json();

        document.getElementById("place").innerText =
            placeData.display_name || "Location not found";

    } catch (err) {
        console.error("Route error:", err);
    }
}
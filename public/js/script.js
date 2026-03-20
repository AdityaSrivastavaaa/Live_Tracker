const socket = io({ transports: ["websocket"] });

// USER
let username = localStorage.getItem("username");
let color = localStorage.getItem("color");

if (!username) {
    document.getElementById("nameModal").style.display = "flex";
}

if (!color) {
    color = "#" + Math.floor(Math.random() * 16777215).toString(16);
    localStorage.setItem("color", color);
}

function saveName() {
    const name = document.getElementById("nameInput").value.trim();
    if (!name) return alert("Enter name");

    localStorage.setItem("username", name);
    location.reload();
}

// MAP
const map = L.map("map", { minZoom: 10, maxZoom: 18 })
    .setView([20.5937, 78.9629], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// 🔥 FIX MOBILE RENDER BUG
setTimeout(() => map.invalidateSize(), 500);

let myLocation = null;
let isFirst = true;
let lastEmit = 0;
let routeLayer = null;

const markers = {};

// LOCATION
navigator.geolocation.watchPosition((pos) => {
    const now = Date.now();
    if (now - lastEmit < 2000) return;
    lastEmit = now;

    const { latitude, longitude } = pos.coords;
    myLocation = [latitude, longitude];

    if (isFirst) {
        map.setView(myLocation, 16);
        isFirst = false;
    }

    socket.emit("send-location", { latitude, longitude, username, color });

}, console.error);

// MARKER
function createMarker(lat, lng, username, color, isMe) {
    return L.marker([lat, lng], {
        icon: L.divIcon({
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

// RECEIVE
socket.on("receive-location", (data) => {
    const { id, latitude, longitude, username, color } = data;
    const isMe = socket.id === id;

    if (markers[id]) {
        markers[id].setLatLng([latitude, longitude]);
    } else {
        markers[id] = createMarker(latitude, longitude, username, color, isMe)
            .addTo(map);
    }
});

// USERS
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

// ROUTE
async function showRoute(user) {
    if (!myLocation) return;

    const [lat1, lon1] = myLocation;
    const { latitude: lat2, longitude: lon2 } = user;

    const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`
    );

    const data = await res.json();
    const route = data.routes[0];

    const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

    if (routeLayer) map.removeLayer(routeLayer);

    routeLayer = L.polyline(coords, { color: "blue", weight: 6 }).addTo(map);

    map.flyTo([lat2, lon2], 16);

    document.getElementById("eta").innerText =
        `ETA: ${Math.round(route.duration / 60)} mins`;

    const place = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat2}&lon=${lon2}`
    );

    const placeData = await place.json();
    document.getElementById("place").innerText =
        placeData.display_name || "";
}
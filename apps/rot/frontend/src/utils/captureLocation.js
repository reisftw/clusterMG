export function captureLocation() {
 return new Promise((resolve, reject) => {
  if (!navigator.geolocation) return reject(new Error("Geolocalização indisponível neste dispositivo."));
  navigator.geolocation.getCurrentPosition(
   ({ coords, timestamp }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, capturedAt: new Date(timestamp).toISOString() }),
   error => reject(new Error(error.code === 1 ? "Permita o acesso à localização nas configurações do navegador." : "Não foi possível obter o GPS. Tente novamente em local aberto.")),
   { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
 });
}

# Social location geocoding deployment

The Social location API uses a private Photon service. The mobile application calls only the authenticated Sporto routes:

- `GET /api/v1/social-locations/search?q=...&limit=8`
- `POST /api/v1/social-locations/resolve` with `{ "text": "..." }`
- `GET /api/v1/social-locations/reverse?lat=...&lon=...`

Success uses the existing `{ statusCode, message, data }` envelope. Search returns `[]` for no matches. Resolution returns 404 for no matching place, 422 for incomplete address data, and 503 when Photon rejects or cannot be reached. Authentication uses the existing bearer token and `x-app-key`; the route's default throttle limits each user to 60 requests per 30 seconds.

## Private Photon prerequisite

Install Java 21 or newer, obtain a matching Photon release JAR and the Asia database dump from the [Photon project](https://github.com/komoot/photon#setting-photon-up-with-the-release-binaries-and-extracts) and [GraphHopper extracts](https://download1.graphhopper.com/public/asia/). Extract the archive so `photon_data` sits beside the JAR, then run `java -jar photon-*.jar serve` from that directory. Use a private host or container network; do not expose port 2322 publicly. Reserve disk space for a second database copy during atomic updates.

Set `PHOTON_BASE_URL` on the Sporto backend to the internal origin, for example `http://photon:2322` when both containers share a network or `http://127.0.0.1:2322` when running on one host. Production startup requires this variable. No Photon URL or credentials are shipped in Flutter.

Verify Photon first with `/api?q=Hanoi&limit=1`, then start the backend. Check an authenticated search for a known Vietnamese venue and a reverse lookup for its coordinates. Finally use the Social location picker on a device for search, full address, Google Maps link, pin preview, and confirmation. A venue absent from OpenStreetMap/Photon may still have no result; `MK Building` needs a full address or pin for a deterministic production check.

The production VPS compose file is managed outside this repository. Merge the [private Photon service example](../deploy/photon.compose.example.yml) into it and set `PHOTON_BASE_URL` before deploying the backend and mobile build. Keep the existing Regions API for province/ward names; it is not a venue search service.

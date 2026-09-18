# Pose Landmarker assets

- Model: Google MediaPipe Pose Landmarker Lite, float16, version 1
- Source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`
- Documentation and model card: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker#models

The original model is included without modification. `npm run dev` and `npm run build` verify its checksum. Do not replace it with an unversioned `latest` download.

The MediaPipe JavaScript/WASM runtime is provided by the exact version of `@mediapipe/tasks-vision` in `package.json` and `package-lock.json` (Apache-2.0). Its WASM files are copied from the installed package into the ignored `public/mediapipe/wasm/` directory before development/build, and included in the production output. The upstream MediaPipe license is included in `MEDIAPIPE-LICENSE.txt` (source: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).

All runtime assets are served from the app's own origin. Camera frames and pose results stay in the browser.

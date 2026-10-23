# `inference`

SageMaker Serverless endpoints for the models Bedrock does not host: SAM2 skyline segmentation and the DEM raycaster.

## Resources

- SageMaker model from `zeitzeuge/falsifier:<model_version>` (SAM2 skyline
  segmentation + swissALTI3D horizon raycaster in one container)
- Serverless endpoint config (6 GB, max concurrency 4) and endpoint
  `zeitzeuge-prod-falsifier`
- Alarms on the endpoint live in `observability`

All three are created once `falsifier_image_ready = true`.

## Notes

This module is the technical core of the Terrain Falsification capability (6.1), so it is also the highest-risk thing to build on the day. Have a precomputed-horizon fallback: if the endpoint is not ready, the falsifier reads cached ridgelines from S3 and the demo is unchanged.

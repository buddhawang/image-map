# image-map

> 

[![NPM](https://img.shields.io/npm/v/image-map.svg)](https://www.npmjs.com/package/image-map) [![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Install

```bash
npm install --save image-map
```

## Usage

```tsx
import * as React from 'react'
import ImageMap from 'image-map'

class Example extends React.Component {
  render () {
    return (
        <ImageMap
          imageUri={"your_image_url"}
          ocrResult={{}}
          enableFeatureSelection={false}
          handleFeatureSelect={() => {}}
          shouldCreateFeature={false}
          featureCreator={() => {}}
          onFeatureCreated={() => {}}
          featureStyler={() => {}}
          shouldUpdateFeature={false}
          featureUpdater={() => {}}
          onFeatureUpdated={() => {}}
          onMapReady={() => {}}
          shouldEnableDrawingBox={false}
          drawBoxStyler={undefined}
          onBoxDrawn={undefined} />
    )
  }
}
```

## License

MIT, Copyright @ Microsoft Corporation

import React, { Component } from 'react'

import { ImageMap } from 'image-map';
import Style from "ol/style/Style";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import 'ol/ol.css';

export default class App extends Component {
  state = {
    ocr: null,
    showOcr: true,
    enableDrawingBox: false
  }

  componentDidMount = () => {
    fetch(process.env.PUBLIC_URL + '/resources/coffee.jpg.ocr.json')
      .then(response => response.json())
      .then(json => {
        this.setState({ ocr: json });
      });
  }

  render = () => {
    return (
      <div>
        <button onClick={this.toggleOcr}>Show/Hide OCR</button>
        <button onClick={this.toggleDrawBox}>Draw Box</button>
        <ImageMap
          imageUri={process.env.PUBLIC_URL + '/resources/coffee.jpg'}
          ocrResult={(!this.state.showOcr || this.state.ocr == null) ? {} : this.state.ocr.recognitionResults[0]}
          enableFeatureSelection={false}
          handleFeatureSelect={() => {}}
          shouldCreateFeature={false}
          featureCreator={this.featureCreator}
          onFeatureCreated={() => {}}
          featureStyler={this.featureStyler}
          shouldUpdateFeature={false}
          featureUpdater={() => {}}
          onFeatureUpdated={() => {}}
          onMapReady={() => {}}
          shouldEnableDrawingBox={this.state.enableDrawingBox}
          drawBoxStyler={undefined}
          onBoxDrawn={undefined} />
      </div>
    )
  }

  toggleOcr = () => {
    this.setState({ showOcr: !this.state.showOcr });
  }

  toggleDrawBox = () => {
    this.setState({ enableDrawingBox: !this.state.enableDrawingBox });
  }

  featureCreator = (text, boundingBox, extend) => {
    var coordinates = [];
    var imageWidth = extend[2] - extend[0];
    var imageHeight = extend[3] - extend[1];
    var ocrWidth = this.state.ocr.recognitionResults[0].width;
    var ocrHeight = this.state.ocr.recognitionResults[0].height;

    for (let i = 0; i < boundingBox.length; i += 2) {
        // boundingBox is int[8] to represent 4 points of rectangle: [x1, y1, x2, y2, x3, y3, x4, y4]
        // extend is int[4] to represent image dimentions: [left, bottom, right, top]
        coordinates.push([
            Math.round((boundingBox[i] / ocrWidth) * imageWidth),
            Math.round((1 - (boundingBox[i + 1] / ocrHeight)) * imageHeight)
        ]);
    }

    var feature = {
        'type': 'Feature',
        'properties': {
            'state': 'unselected',
            'text': text,
            'boundingbox': boundingBox
        },
        'geometry': {
            'type': 'Polygon',
            'coordinates': [coordinates]
        }
    };

    return feature;
  }

  featureStyler = (feature) => {
    return new Style({
        stroke: new Stroke({
            color: 'yellow',
            width: 1
        }),
        fill: new Fill({
            color: 'rgba(255, 255, 0, 0.3)'
        })
    });
  }

  featureUpdater = (feature, extend) => {
    return feature;
  }
}

import ImageMap from "image-map";
import GeoJSON from "ol/format/GeoJSON.js";
import "ol/ol.css";
import React, { Component } from "react";

export default class App extends Component {
  state = {
    imageUri: "",
    imageWidth: 0,
    imageHeight: 0,
  }

  imageElement = new Image();
  imageMap;

  componentDidMount() {
    this.imageElement.addEventListener("load", this.imageOnLoad);
    this.imageElement.src = process.env.PUBLIC_URL + "/resources/coffee.jpg";
  }

  componentWillUnmount() {
    this.imageElement.removeEventListener("load", this.imageOnLoad);
  }

  render = () => {
    return (
      <div>
        <ImageMap
          ref={(ref) => this.imageMap = ref}
          imageUri={this.state.imageUri}
          imageWidth={this.state.imageWidth}
          imageHeight={this.state.imageHeight} />
      </div>
    )
  }

  featureCreator = (text, boundingBox, imageExtent, ocrExtent) => {
    const coordinates = [];
    const imageWidth = imageExtent[2] - imageExtent[0];
    const imageHeight = imageExtent[3] - imageExtent[1];
    const ocrWidth = ocrExtent[2] - ocrExtent[0];
    const ocrHeight = ocrExtent[3] - ocrExtent[1];

    for (let i = 0; i < boundingBox.length; i += 2) {
        // boundingBox is int[8] to represent 4 points of rectangle: [x1, y1, x2, y2, x3, y3, x4, y4]
        // extend is int[4] to represent image dimentions: [left, bottom, right, top]
        coordinates.push([
            Math.round((boundingBox[i] / ocrWidth) * imageWidth),
            Math.round((1 - (boundingBox[i + 1] / ocrHeight)) * imageHeight)
        ]);
    }

    const feature = {
        "type": "Feature",
        "properties": {
            "state": "unselected",
            "text": text,
            "boundingbox": boundingBox
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [coordinates]
        }
    };

    return feature;
  }

  imageOnLoad = () => {
    this.setState({
      imageUri: this.imageElement.src,
      imageWidth: this.imageElement.width,
      imageHeight: this.imageElement.height,
    }, () => {
      // display OCR
      fetch(process.env.PUBLIC_URL + "/resources/coffee.jpg.ocr.json")
        .then(response => response.json())
        .then(json => {
          const features = this.convertOcrToFeatures(json);
          this.imageMap.addFeatures(features);
        });
    });
  }

  convertOcrToFeatures = (json) => {
    const imageExtent = this.imageMap.getImageExtent();
    const ocrExtent = [0, 0, json.recognitionResults[0].width, json.recognitionResults[0].height];

    const features = [];
    json.recognitionResults[0].lines.forEach((line) => {
      line.words.forEach((word) => {
        const feature = this.featureCreator(word.text, word.boundingBox, imageExtent, ocrExtent);
        features.push(feature);
      });
    });

    const geoJsonObject = {
      "type": "FeatureCollection",
      "crs": {
          "type": "name",
      },
      "features": features,
    }

    return (new GeoJSON()).readFeatures(geoJsonObject);
  }
}

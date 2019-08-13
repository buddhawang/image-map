/**
 * @class ImageMap
 */

import * as React from 'react';
import './styles.css';

//OpenLayers libraries
import 'ol/ol.css';
import { Map, View, Feature, MapBrowserEvent } from 'ol';
import { defaults as defaultInteractions, DragRotateAndZoom, DragPan } from 'ol/interaction';
import { getCenter } from 'ol/extent';
import Projection from 'ol/proj/Projection';
import Layer from 'ol/layer/Layer';
import ImageLayer from 'ol/layer/Image';
import Static from 'ol/source/ImageStatic';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import Style from 'ol/style/Style';
import Draw, { createBox } from 'ol/interaction/Draw';
import GeometryType from 'ol/geom/GeometryType';

interface ImageMapProps {
    imageUri: string;
    ocrResult: any;
    enableFeatureSelection: boolean;
    handleFeatureSelect: Function;

    shouldCreateFeature: boolean;
    featureCreator: Function;
    onFeatureCreated: Function;

    featureStyler: Function;

    shouldUpdateFeature: boolean;
    featureUpdater: Function;
    onFeatureUpdated: Function;

    shouldEnableDrawingBox: boolean;
    drawBoxStyler?: () => Style;
    onBoxDrawn?: Function;

    onMapReady: Function;
}

interface ImageMapState {
}

export class ImageMap extends React.Component<ImageMapProps, ImageMapState> {
    private image = new Image();
    private imageLayer: ImageLayer;
    private boundingBoxVectorLayer: VectorLayer;
    private map: Map;

    private imageExtend: number[];
    private imageUri: string;

    private ocrResult: any;
    private ocrFeatures: any[] = [];

    private countPointerDown: number = 0;
    private isSwiping: boolean = false;

    private mapEl: HTMLDivElement | null = null;

    private readonly BOUNDINGBOX_LAYER_NAME = 'boundingboxlayer';

    private draw: any = null;
    private drawBoxEnabled: boolean = false;

    private boundingBoxLayerFilter = {
        layerFilter: (layer: Layer) => layer.get('name') === this.BOUNDINGBOX_LAYER_NAME
    };

    constructor(props: ImageMapProps) {
        super(props);

        this.imageUri = props.imageUri;
        this.imageExtend = [0, 0, 1024, 968];

        this.loadImage = this.loadImage.bind(this);
        this.onImageLoad = this.onImageLoad.bind(this);

        this.initMap = this.initMap.bind(this);

        this.resetImage = this.resetImage.bind(this);
        this.resetOcr = this.resetOcr.bind(this);
        this.updateOcr = this.updateOcr.bind(this);

        this.createProjection = this.createProjection.bind(this);
        this.createMapView = this.createMapView.bind(this);
        this.createImageSource = this.createImageSource.bind(this);
        this.createBoundingBoxVectorFeatures = this.createBoundingBoxVectorFeatures.bind(this);
        this.drawBoundingBox = this.drawBoundingBox.bind(this);

        this.getMinimumZoom = this.getMinimumZoom.bind(this);

        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);

        this.setDragPanInteraction = this.setDragPanInteraction.bind(this);
    }

    componentDidMount() {
        this.image.addEventListener("load", this.onImageLoad);
        this.initMap();
        this.loadImage();
    }

    componentWillUnmount() {
        this.image.removeEventListener("load", this.onImageLoad);
    }

    componentWillReceiveProps(props: ImageMapProps) {
        if (props.imageUri != this.imageUri) {
            this.imageUri = props.imageUri;
            this.loadImage();
        }
        if (props.ocrResult != this.ocrResult) {
            this.ocrResult = props.ocrResult;
            this.resetOcr();
        }
        if (props.shouldCreateFeature) {
            this.resetOcr();
            props.onFeatureCreated();
        }
        if (props.shouldUpdateFeature) {
            this.updateOcr()
            props.onFeatureUpdated();
        }
        if (props.shouldEnableDrawingBox != this.drawBoxEnabled) {
            this.drawBoxEnabled = props.shouldEnableDrawingBox;
            this.drawBoxEnabled ? this.addDrawBoxInteraction() : this.removeDrawBoxInteraction()
        }
    }

    shouldComponentUpdate() {
        // We don't need React to re-render the DOM structure, openlayers will redraw the map for us.
        // Set it to false for improving performance.
        return false;
    }

    render() {
        return (
            <div className="map-wrapper">
                <div id="map" className="map" ref={el => this.mapEl = el}></div>
            </div>
        );
    }

    loadImage() {
        this.image.src = this.imageUri;
    }

    onImageLoad(event: any) {
        this.imageExtend = [0, 0, event.target.width, event.target.height];
        this.resetImage();
        this.updateOcr();
        this.props.onMapReady();
    }

    initMap() {
        var projection = this.createProjection(this.imageExtend);

        this.imageLayer = new ImageLayer({
            source: this.createImageSource(this.imageUri, projection, this.imageExtend)
        });

        var options: any = {};
        options.name = this.BOUNDINGBOX_LAYER_NAME;
        options.style = this.props.featureStyler;
        this.boundingBoxVectorLayer = new VectorLayer(options);

        this.map = new Map({
            interactions: defaultInteractions({ doubleClickZoom: false }).extend([new DragRotateAndZoom()]),
            target: 'map',
            layers: [this.imageLayer, this.boundingBoxVectorLayer],
            view: this.createMapView(projection, this.imageExtend)
        });

        this.map.on('pointerdown', this.handlePointerDown);
        this.map.on('pointermove', this.handlePointerMove);
        this.map.on('pointerup', this.handlePointerUp);
    }

    resetImage() {
        var projection = this.createProjection(this.imageExtend);
        this.imageLayer.setSource(this.createImageSource(this.imageUri, projection, this.imageExtend));
        var mapView = this.createMapView(projection, this.imageExtend);
        this.map.setView(mapView);
    }

    resetOcr() {
        this.drawBoundingBox(this.createBoundingBoxVectorFeatures());
    }

    updateOcr() {
        if (this.boundingBoxVectorLayer && this.boundingBoxVectorLayer.getSource()) {
            this.boundingBoxVectorLayer.getSource().forEachFeature(feature => this.props.featureUpdater(feature, this.imageExtend));
        }
    }

    createProjection(imageExtend: number[]) {
        return new Projection({
            code: 'xkcd-image',
            units: 'pixels',
            extent: imageExtend
        });
    }

    createMapView(projection: Projection, imageExtend: number[]) {
        var minZoom = this.getMinimumZoom();
        var rotation = (this.ocrResult && this.ocrResult.imageOrientation != null && this.ocrResult.imageTiltAngle != null)
            ? this.degreeToRadians(this.ocrResult.imageOrientation - this.ocrResult.imageTiltAngle)
            : 0;

        return new View({
            projection: projection,
            center: getCenter(imageExtend),
            rotation: rotation,
            zoom: minZoom,
            minZoom: minZoom
        });
    }

    createImageSource(imageUri: string, projection: Projection, imageExtend: number[]) {
        return new Static({
            url: imageUri,
            projection: projection,
            imageExtent: imageExtend
        })
    }

    createBoundingBoxVectorFeatures() {
        this.ocrFeatures = [];
        if (this.ocrResult.lines != null) {
            this.ocrResult.lines.forEach((line: { words: { forEach: (arg0: (word: any) => number) => void; } | null; }) => {
                if (line.words != null) {
                    line.words.forEach(word => this.ocrFeatures.push(this.props.featureCreator(word.text, word.boundingBox, this.imageExtend)));
                }
            })
        }
        return this.ocrFeatures;
    }

    drawBoundingBox(boundingBoxVectorFeatures: Feature[]) {
        var geoJsonObject = {
            'type': 'FeatureCollection',
            'crs': {
                'type': 'name'
            },
            'features': boundingBoxVectorFeatures
        }

        var source = new VectorSource({
            features: (new GeoJSON()).readFeatures(geoJsonObject)
        });
        this.boundingBoxVectorLayer.setSource(source);
    }

    getMinimumZoom() {
        // In openlayers, the image will be projected into 256x256 pixels, and image will be 2x larger at each zoom level.
        // https://openlayers.org/en/latest/examples/min-zoom.html
        var containerAspectRatio = this.mapEl!.clientHeight / this.mapEl!.clientWidth;
        var imageAspectRatio = this.image.naturalHeight / this.image.naturalWidth;
        if (this.ocrResult && this.ocrResult.imageOrientation != null && this.ocrResult.imageOrientation % 180 != 0) {
            imageAspectRatio = 1 / imageAspectRatio;
        }
        if (imageAspectRatio > containerAspectRatio) {
            // Fit to width
            return Math.LOG2E * Math.log(this.mapEl!.clientHeight / 256);
        }
        else {
            // Fit to height
            return Math.LOG2E * Math.log(this.mapEl!.clientWidth / 256);
        }
    }

    handlePointerDown(event: MapBrowserEvent) {
        if (!this.props.enableFeatureSelection) {
            return;
        }

        this.countPointerDown += 1;
        if (this.countPointerDown >= 2) {
            this.setDragPanInteraction(true /*dragPanEnabled*/);
            this.isSwiping = false;
            return;
        }

        var isPointerOnFeature = this.map.hasFeatureAtPixel(
            this.map.getEventPixel(event.originalEvent),
            this.boundingBoxLayerFilter);

        if (isPointerOnFeature) {
            this.map.forEachFeatureAtPixel(
                this.map.getEventPixel(event.originalEvent),
                (feature) => this.props.handleFeatureSelect(feature),
                this.boundingBoxLayerFilter);
        }

        this.setDragPanInteraction(!isPointerOnFeature /*dragPanEnabled*/);
        this.isSwiping = isPointerOnFeature;
    }

    handlePointerMove(event: MapBrowserEvent) {
        if (!this.props.enableFeatureSelection) {
            return;
        }

        if (!this.isSwiping) {
            return;
        }

        // disable vertical scrolling for iOS Safari
        event.preventDefault();

        this.map.forEachFeatureAtPixel(
            this.map.getEventPixel(event.originalEvent),
            feature => this.props.handleFeatureSelect(feature, false /*isTaggle*/),
            this.boundingBoxLayerFilter);
    }

    handlePointerUp() {
        if (!this.props.enableFeatureSelection) {
            return;
        }

        this.countPointerDown -= 1;
        if (this.countPointerDown == 0) {
            this.setDragPanInteraction(true /*dragPanEnabled*/);
            this.isSwiping = false;
        }
    }

    setDragPanInteraction(dragPanEnabled: boolean) {
        this.map.getInteractions().forEach(interaction => {
            if (interaction instanceof DragPan) {
                interaction.setActive(dragPanEnabled);
            }
        });
    }

    // convert degree to radians
    degreeToRadians(degree: number) {
      return degree * Math.PI * 2 / 360;
    }
  
    // Allow user to draw boxes on the image
    addDrawBoxInteraction() {
        // To make the OpenLayers box the same color as selected button, have to set the style for each part of Draw seperately
        this.draw = new Draw({
            source: this.boundingBoxVectorLayer.getSource(),
            type: GeometryType.CIRCLE,
            stopClick: true,
            style: this.props.drawBoxStyler,
            geometryFunction: createBox()
        });

        this.draw.on('drawend', (e:any) => {
            if (this.props.onBoxDrawn) {
                this.props.onBoxDrawn(e.feature)
            }
        });

        this.map.addInteraction(this.draw);
    }

    removeDrawBoxInteraction = () => {
        if (this.draw) {
            this.map.removeInteraction(this.draw);
        }
    }

}

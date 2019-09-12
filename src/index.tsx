/**
 * @class ImageMap
 */

import * as React from 'react';
import './styles.css';

//OpenLayers libraries
import 'ol/ol.css';
import { Map, View, Feature, MapBrowserEvent } from 'ol';
import { defaults as defaultInteractions, DragRotateAndZoom, DragPan } from 'ol/interaction';
import { getCenter, Extent } from 'ol/extent';
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

    private ignorePointerMoveEventCount = 5;
    private pointerMoveEventCount = 0;
    
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

        this.addFeature = this.addFeature.bind(this);
        this.addFeatures = this.addFeatures.bind(this);
        this.getAllFeatures = this.getAllFeatures.bind(this);
        this.removeFeature = this.removeFeature.bind(this);
        this.removeAllFeatures = this.removeAllFeatures.bind(this);
    }

    public componentDidMount() {
        this.image.addEventListener("load", this.onImageLoad);
        this.initMap();
        this.loadImage();
    }

    public componentWillUnmount() {
        this.image.removeEventListener("load", this.onImageLoad);
    }

    public componentWillReceiveProps(props: ImageMapProps) {
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

    public shouldComponentUpdate() {
        // We don't need React to re-render the DOM structure, openlayers will redraw the map for us.
        // Set it to false for improving performance.
        return false;
    }

    /**
     * Add one feature to the map
     */
    public addFeature(feature: Feature) {
        this.boundingBoxVectorLayer.getSource().addFeature(feature);
    }

    /**
     * Add features to the map
     */
    public addFeatures(features: Feature[]) {
        this.boundingBoxVectorLayer.getSource().addFeatures(features);
    }

    /**
     * Get all features from the map
     */
    public getAllFeatures() {
        return this.boundingBoxVectorLayer.getSource().getFeatures();
    }

    /**
     * Remove specific feature object from the map
     */
    public removeFeature(feature: Feature) {
        this.boundingBoxVectorLayer.getSource().removeFeature(feature);
    }

    /**
     * Remove all features from the map
     */
    public removeAllFeatures() {
        this.boundingBoxVectorLayer.getSource().clear();
    }

    /**
     * Get the image extent (left, top, right, bottom)
     */
    public getImageExtent() {
        return this.imageExtend;
    }

    /**
     * Get features at specific extend
     */
    public getFeaturesInExtent(extent: Extent) {
        let features: Feature[] = [];
        this.boundingBoxVectorLayer.getSource().forEachFeatureInExtent(extent, feature => {
            features.push(feature);
        });
        return features;
    }

    public render() {
        return (
            <div className="map-wrapper">
                <div id="map" className="map" ref={el => this.mapEl = el}></div>
            </div>
        );
    }

    private loadImage() {
        this.image.src = this.imageUri;
    }

    private onImageLoad(event: any) {
        this.imageExtend = [0, 0, event.target.width, event.target.height];
        this.resetImage();
        this.updateOcr();
        this.props.onMapReady();
    }

    private initMap() {
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

    private resetImage() {
        var projection = this.createProjection(this.imageExtend);
        this.imageLayer.setSource(this.createImageSource(this.imageUri, projection, this.imageExtend));
        var mapView = this.createMapView(projection, this.imageExtend);
        this.map.setView(mapView);
    }

    private resetOcr() {
        this.drawBoundingBox(this.createBoundingBoxVectorFeatures());
    }

    private updateOcr() {
        if (this.boundingBoxVectorLayer && this.boundingBoxVectorLayer.getSource()) {
            this.boundingBoxVectorLayer.getSource().forEachFeature(feature => this.props.featureUpdater(feature, this.imageExtend));
        }
    }

    private createProjection(imageExtend: number[]) {
        return new Projection({
            code: 'xkcd-image',
            units: 'pixels',
            extent: imageExtend
        });
    }

    private createMapView(projection: Projection, imageExtend: number[]) {
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

    private createImageSource(imageUri: string, projection: Projection, imageExtend: number[]) {
        return new Static({
            url: imageUri,
            projection: projection,
            imageExtent: imageExtend
        })
    }

    private createBoundingBoxVectorFeatures() {
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

    private drawBoundingBox(boundingBoxVectorFeatures: Feature[]) {
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

    private getMinimumZoom() {
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

    private handlePointerDown(event: MapBrowserEvent) {
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

    private handlePointerMove(event: MapBrowserEvent) {
        if (this.shouldIgnorePointerMove()) {
            return;
        }

        // disable vertical scrolling for iOS Safari
        event.preventDefault();

        this.map.forEachFeatureAtPixel(
            this.map.getEventPixel(event.originalEvent),
            feature => this.props.handleFeatureSelect(feature, false /*isTaggle*/),
            this.boundingBoxLayerFilter);
    }

    private handlePointerUp() {
        if (!this.props.enableFeatureSelection) {
            return;
        }

        this.countPointerDown -= 1;
        if (this.countPointerDown == 0) {
            this.setDragPanInteraction(true /*dragPanEnabled*/);
            this.isSwiping = false;
            this.pointerMoveEventCount = 0;
        }
    }

    private setDragPanInteraction(dragPanEnabled: boolean) {
        this.map.getInteractions().forEach(interaction => {
            if (interaction instanceof DragPan) {
                interaction.setActive(dragPanEnabled);
            }
        });
    }

    // convert degree to radians
    private degreeToRadians(degree: number) {
      return degree * Math.PI * 2 / 360;
    }
  
    // Allow user to draw boxes on the image
    private addDrawBoxInteraction() {
        this.draw = new Draw({
            source: this.boundingBoxVectorLayer.getSource(),
            type: GeometryType.CIRCLE,
            stopClick: true,
            style: this.props.drawBoxStyler,
            geometryFunction: createBox()
        });

        this.draw.on('drawend', (e:any) => {
            if (this.props.onBoxDrawn) {
                this.props.onBoxDrawn(e.feature, this.imageExtend);
            }
        });

        this.map.addInteraction(this.draw);
    }

    private removeDrawBoxInteraction = () => {
        if (this.draw) {
            this.map.removeInteraction(this.draw);
        }
    }

    private shouldIgnorePointerMove() {
        if (!this.props.enableFeatureSelection) {
            return true;
        }

        if (!this.isSwiping) {
            return true;
        }

        if (this.ignorePointerMoveEventCount > this.pointerMoveEventCount) {
            ++this.pointerMoveEventCount;
            return true;
        }

        return false;
    }
}

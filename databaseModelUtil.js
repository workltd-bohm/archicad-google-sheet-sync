import { getConfigurationCorePropertyMap, getConfigurationCustomPropertyMap } from "./config.js";

export class DatabaseModelUtil {
    static resolveClassification(dbClassifications, classification, classificationElementTypeGroup) {
        const dbClassification = dbClassifications.find(dbClassification => dbClassification.code === classification.code + "__01");
        const dbClassificationElementTypeGroup = dbClassifications.find(dbClassification => dbClassification.code === classificationElementTypeGroup.code);
        const consistentHierarchy = classification.code != classificationElementTypeGroup.code && classificationElementTypeGroup.code.includes(classification.code);

        if (dbClassificationElementTypeGroup != null && consistentHierarchy) {
            return dbClassificationElementTypeGroup;
        }

        if (dbClassification != null) {
            return dbClassification;
        }

        return dbClassifications.find(dbClassification => dbClassification.code === "Ss__01")
    }

    static composeElementModelFromDto(dbClassifications, elementDto, projectCode) {
        let dbElement = {
            guid: elementDto.guid,
            projectCode: projectCode,
            name: elementDto.name,
            type: elementDto.type,
            variation: elementDto.variation,
            zone: elementDto.zone,
            level: elementDto.level,
            geometry: {
                x: elementDto.geometry.x,
                y: elementDto.geometry.y,
                elevation: elementDto.geometry.elevation,
                rotatingAngle: elementDto.geometry.rotatingAngle
            },
            dimension: {
                width: elementDto.dimension.width,
                height: elementDto.dimension.height,
                depth: elementDto.dimension.depth
            },
            location: elementDto.location,
            material: elementDto.material,
            finish: elementDto.finish,
            mount: elementDto.mount,
            modiStamp: elementDto.modiStamp,
            classification: this.resolveClassification(dbClassifications, elementDto.classification, elementDto.classificationElementTypeGroup),
            libraryPart: {
                index: elementDto.libraryPart.index,
                documentName: elementDto.libraryPart.documentName,
                uniqueId: elementDto.libraryPart.uniqueId
            },
            token: {
                fungible: false,
                contractAddress: null,
                id: null
            },
            coreProperties: elementDto.coreProperties,
            customProperties: elementDto.customProperties
        };

        return dbElement;
    }

    static composeElementSnapshotFromModel(dbElement, triggeredFrom, triggeredFromDetail) {
        let dbSnapshot = structuredClone(dbElement);
        delete dbSnapshot._id;
        dbSnapshot.timestamp = new Date();
        dbSnapshot.triggeredFrom = triggeredFrom;
        dbSnapshot.triggeredFromDetail = triggeredFromDetail;

        return dbSnapshot;
    }

    static getKeyByDbKey(map, dbKeyValue) {
        const key = Array.from(map.keys()).find(key => key.dbKey === dbKeyValue.toLowerCase());
        return key;
    };

    static composeProjectDtoFromDatabase(dbProject, dbElements, dbDeletedElementGuids = []) {
        let projectDto = {
            name: dbProject.name,
            code: dbProject.code,
            elements: [],
            deletedElements: []
        };

        dbElements.forEach(dbElement => {
            projectDto.elements.push(this.composeElementDtoFromDatabase(dbElement));
        });

        dbDeletedElementGuids.forEach(dbDeletedElementGuid => {
            projectDto.deletedElements.push(dbDeletedElementGuid);
        });

        return projectDto;
    }

    static composeElementDtoFromDatabase(dbElement) {
        let elementDto = {
            guid: dbElement.guid,
            projectCode: dbElement.projectCode,
            name: dbElement.name,
            type: dbElement.type,
            variation: dbElement.variation,
            modiStamp: dbElement.modiStamp,
            classification: {
                code: (() => dbElement.classification.code.split("__")[0])(),
            },
            classificationElementTypeGroup: {
                code: dbElement.classification.code
            },
            libraryPart: {
                index: dbElement.libraryPart.index,
                documentName: dbElement.libraryPart.documentName,
                uniqueId: dbElement.libraryPart.uniqueId
            },
            coreProperties: {},
            customProperties: {}
        };

        let corePropertyGroupMap = getConfigurationCorePropertyMap();
        let customPropertyGroupMap = getConfigurationCustomPropertyMap();

        corePropertyGroupMap.forEach((corePropertyMap, corePropertyGroup) => {
            elementDto.coreProperties[corePropertyGroup.xmlKey] = {};
            corePropertyMap.forEach(coreProperty => {
                if (coreProperty.dbKey == "datasheets") {
                    // console.log(dbElement.coreProperties[corePropertyGroup.dbKey][coreProperty.dbKey]);
                    elementDto.coreProperties[corePropertyGroup.xmlKey][coreProperty.xmlKey] = dbElement.coreProperties[corePropertyGroup.dbKey][coreProperty.dbKey]?.map(datasheet => datasheet.link).join(" / ");
                } else {
                    elementDto.coreProperties[corePropertyGroup.xmlKey][coreProperty.xmlKey] = dbElement.coreProperties[corePropertyGroup.dbKey][coreProperty.dbKey];
                }

            });
        });

        if (elementDto.classificationElementTypeGroup.code?.length > 0) {
            const customPropertyGroup = Array.from(customPropertyGroupMap.keys()).find(key => key.dbKey === elementDto.classificationElementTypeGroup.code.toLowerCase());

            if (customPropertyGroup != null) {
                elementDto.customProperties[customPropertyGroup.xmlKey] = {};

                customPropertyGroupMap.get(customPropertyGroup).forEach(customProperty => {
                    elementDto.customProperties[customPropertyGroup.xmlKey][customProperty.xmlKey] = dbElement.customProperties?.[customPropertyGroup.dbKey]?.[customProperty.dbKey] ?? null;
                });
            }
        }

        return elementDto;
    }



    static composeClassificationFullName(classificationGroup) {
        if (classificationGroup?.code?.length > 0 && classificationGroup?.name?.length > 0) {
            return `${classificationGroup.code} ${classificationGroup.name}`;
        }
        return "";
    }
};
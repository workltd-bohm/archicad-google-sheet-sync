import { configurationCorePropertyMap, configurationCustomPropertyMap } from "./config.js";

export class DatabaseModelUtil {
    // composeProject = function (projectDto, scheduleDtos) {
    //     let dbProject = {
    //         name: projectDto.name,
    //         code: projectDto.code,
    //         companyCode: "WRK",
    //         zones: [],
    //         roles: [],
    //         milestones: [],
    //         schedules: []
    //     };

    //     if (scheduleDtos?.length > 0) {
    //         scheduleDtos.forEach(scheduleDto => {
    //             dbProject.schedules.push({
    //                 name: scheduleDto.name,
    //                 code: scheduleDto.code,
    //                 start: scheduleDto.start,
    //                 end: scheduleDto.end
    //             });
    //         });
    //     }

    //     return dbProject;
    // };

    static composeElementModelFromDto(elementDto) {
        let dbElement = {
            guid: elementDto.guid,
            projectCode: elementDto.projectCode,
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
            classification: {
                code: elementDto.classification.code,
                name: elementDto.classification.name,
                full: elementDto.classification.full
            },
            classificationGroup: {
                code: elementDto.classificationGroup.code,
                name: elementDto.classificationGroup.name,
                full: elementDto.classificationGroup.full
            },
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
            coreProperties: {},
            customProperties: {}
        };

        dbElement.classification.full = this.composeClassificationFullName(dbElement.classification);
        dbElement.classificationGroup.full = this.composeClassificationFullName(dbElement.classificationGroup);

        configurationCorePropertyMap.forEach((corePtyMap, corePtyGpName) => {
            dbElement.coreProperties[corePtyGpName] = {};
            corePtyMap.forEach(corePtyName => {
                dbElement.coreProperties[corePtyGpName][corePtyName] = elementDto.coreProperties[corePtyGpName][corePtyName];
            });
        });

        if (dbElement.classificationGroup?.full?.length > 0) {
            const customPropertyGroupName = dbElement.classificationGroup.full;
            dbElement.customProperties[customPropertyGroupName] = {};

            if (configurationCustomPropertyMap.has(customPropertyGroupName)) {
                configurationCustomPropertyMap.get(customPropertyGroupName).forEach(customPtyName => {
                    dbElement.customProperties[customPropertyGroupName][customPtyName] = elementDto.customProperties[customPropertyGroupName][customPtyName];
                });
            }
        }

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

    static composeProjectDtoFromModel(dbProject, dbElements) {
        let projectDto = {
            name: dbProject.name,
            code: dbProject.code,
            elements: [],
            deletedElements: []
        };

        dbElements.forEach(dbElement => {
            projectDto.elements.push(this.composeElementDtoFromModel(dbElement));
        });

        return projectDto;

    }

    static composeElementDtoFromModel(dbElement) {
        let elementDto = {
            guid: dbElement.guid,
            projectCode: dbElement.projectCode,
            name: dbElement.name,
            type: dbElement.type,
            variation: dbElement.variation,
            modiStamp: dbElement.modiStamp,
            classification: {
                code: dbElement.classification.code,
                name: dbElement.classification.name,
                full: dbElement.classification.full
            },
            classificationGroup: {
                code: dbElement.classificationGroup.code,
                name: dbElement.classificationGroup.name,
                full: dbElement.classificationGroup.full
            },
            libraryPart: {
                index: dbElement.libraryPart.index,
                documentName: dbElement.libraryPart.documentName,
                uniqueId: dbElement.libraryPart.uniqueId
            },
            coreProperties: {},
            customProperties: {}
        };

        elementDto.classification.full = this.composeClassificationFullName(dbElement.classification);
        elementDto.classificationGroup.full = this.composeClassificationFullName(dbElement.classificationGroup);

        configurationCorePropertyMap.forEach((corePtyMap, corePtyGpName) => {
            elementDto.coreProperties[corePtyGpName] = {};
            corePtyMap.forEach(corePtyName => {
                elementDto.coreProperties[corePtyGpName][corePtyName] = dbElement.coreProperties[corePtyGpName][corePtyName];
            });
        });

        if (elementDto.classificationGroup?.full?.length > 0) {
            const customPropertyGroupName = elementDto.classificationGroup.full;
            elementDto.customProperties[customPropertyGroupName] = {};

            if (configurationCustomPropertyMap.has(customPropertyGroupName)) {
                configurationCustomPropertyMap.get(customPropertyGroupName).forEach(customPtyName => {
                    elementDto.customProperties[customPropertyGroupName][customPtyName] = dbElement.customProperties[customPropertyGroupName][customPtyName];
                });
            }
        }

        return elementDto;
    }

    static composeClassificationFullName(classificationGroup) {
        if (classificationGroup?.code?.length > 0 && classificationGroup?.name?.length > 0) {
            return `${classificationGroup.code} ${classificationGroup.name}`;
        }
        return null;
    }
};
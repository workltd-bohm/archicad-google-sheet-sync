import { homedir } from "os";
import { existsSync, readFileSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { select, select1 } from 'xpath';
import { getConfigurationCorePropertyMap, getConfigurationCustomPropertyMap } from "./config.js";

export class XmlFileUtil {
    static composeProjectDtoFromFile(filePath) {
        if (!existsSync(filePath)) {
            console.error("Data file not found");
            return;
        }

        const file = readFileSync(filePath, "utf8");
        const xmlDoc = new DOMParser().parseFromString(file, "text/xml");

        const dto = this.composeProjectDtoFromXmlDoc(xmlDoc);

        return dto;
    }

    static composeProjectDtoFromXmlDoc(xmlDoc) {
        let projectDto = {
            name: null,
            elements: [],
            deletedElements: []
        };

        projectDto.name = select1("/project/@name", xmlDoc).value;

        select("/project/elements/element", xmlDoc).forEach(xmlElement => {
            let element = {
                guid: select1("@guid", xmlElement)?.value,
                name: select1("@name", xmlElement)?.value,
                type: select1("@type", xmlElement)?.value,
                variation: select1("@variation", xmlElement)?.value,
                zone: null,
                level: null,
                geometry: { x: 0, y: 0, elevation: 0, rotatingAngle: 0.0 },
                dimension: { width: 0, height: 0, depth: 0 },
                location: null,
                material: null,
                finish: null,
                mount: null,
                modiStamp: select1("@modiStamp", xmlElement)?.value,
                classification: {
                    code: select1("@code", select1("classification", xmlElement))?.value,
                    name: select1("@name", select1("classification", xmlElement))?.value
                },
                classificationGroup: {
                    code: select1("@code", select1("classification-group", xmlElement))?.value,
                    name: select1("@name", select1("classification-group", xmlElement))?.value
                },
                libraryPart: {
                    index: select1("@index", select1("library-part", xmlElement))?.value,
                    documentName: select1("@documentName", select1("library-part", xmlElement))?.value,
                    uniqueId: select1("@uniqueId", select1("library-part", xmlElement))?.value
                },
                token: {
                    fungible: false,
                    contractAddress: null,
                    id: null
                },
                coreProperties: {},
                customProperties: {}
            };

            element.classification.full = (element.classification.code + ' ' + element.classification.name).trim();
            element.classificationGroup.full = (element.classificationGroup.code + ' ' + element.classificationGroup.name).trim();

            let configurationCorePropertyMap = getConfigurationCorePropertyMap();
            let configurationCustomPropertyMap = getConfigurationCustomPropertyMap();

            configurationCorePropertyMap.forEach((corePtyMap, corePtyGpName) => {
                element.coreProperties[corePtyGpName] = {};
                corePtyMap.forEach(corePtyName => {
                    const corePtyNode = select1(`core-property-groups/group[@name="${corePtyGpName}"]/property[@name="${corePtyName}"]/@value`, xmlElement);
                    element.coreProperties[corePtyGpName][corePtyName] = corePtyNode == undefined || corePtyNode == null ? null : corePtyNode.value;
                });
            });

            if (element.classificationGroup.code != null && element.classificationGroup.name != null) {
                const customPropertyGroupName = `${element.classificationGroup.code} ${element.classificationGroup.name}`;
                element.customProperties[customPropertyGroupName] = {};

                if (configurationCustomPropertyMap.has(customPropertyGroupName)) {
                    configurationCustomPropertyMap.get(customPropertyGroupName).forEach(customPtyName => {
                        const customPtyNode = select1(`custom-property-groups/group[@name="${customPropertyGroupName}"]/property[@name="${customPtyName}"]/@value`, xmlElement);
                        element.customProperties[customPropertyGroupName][customPtyName] = customPtyNode == undefined || customPtyNode == null ? null : customPtyNode.value;
                    });
                }
            }

            projectDto.elements.push(element);
        });

        select("/project/deleted-elements/element", xmlDoc)?.forEach(xmlElement => {
            projectDto.deletedElements.push(select1("@guid", xmlElement)?.value);
        });

        return projectDto;
    }

    static composeXmlObjectFromDto = function (projectDto) {
        let xmlObj = {
            project: {
                "@name": projectDto.name,
                elements: {
                    element: []
                },
                "deleted-elements": {
                    element: []
                }
            }
        };

        for (const elementDto of projectDto.elements) {
            let xmlElement = {
                "@guid": elementDto.guid,
                "@name": elementDto.name,
                "@modiStamp": elementDto.modiStamp,
                "library-part": {
                    "@documentName": elementDto.libraryPart.documentName,
                    "@index": elementDto.libraryPart.index,
                    "@uniqueId": elementDto.libraryPart.uniqueId
                },
                classification: { "@code": elementDto.classification.code, "@name": elementDto.classification.name, "@full": elementDto.classification.full },
                "classification-group": { "@code": elementDto.classificationGroup.code, "@name": elementDto.classificationGroup.name, "@full": elementDto.classificationGroup.full },
                "core-property-groups": { group: [] },
                "custom-property-groups": { group: [] }
            };

            for (const corePtyGroupName of Object.keys(elementDto.coreProperties)) {
                let propertyGroup = { "@name": corePtyGroupName, property: [] };
                for (const corePtyName of Object.keys(elementDto.coreProperties[corePtyGroupName])) {
                    propertyGroup.property.push({ "@name": corePtyName, "@value": elementDto.coreProperties[corePtyGroupName][corePtyName] });
                }

                xmlElement["core-property-groups"].group.push(propertyGroup);
            }

            for (const customPtyGroupName of Object.keys(elementDto.customProperties)) {
                let propertyGroup = { "@name": customPtyGroupName, property: [] };
                for (const customPtyName of Object.keys(elementDto.customProperties[customPtyGroupName])) {
                    propertyGroup.property.push({ "@name": customPtyName, "@value": elementDto.customProperties[customPtyGroupName][customPtyName] });
                }

                xmlElement["custom-property-groups"].group.push(propertyGroup);
            }

            xmlObj.project.elements.element.push(xmlElement);
        }

        return xmlObj;
    }
}
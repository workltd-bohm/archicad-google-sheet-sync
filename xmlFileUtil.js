import { homedir } from "os";
import { existsSync, readFileSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { select, select1 } from 'xpath';
import { getConfigurationCorePropertyMap, getConfigurationCustomPropertyMap } from "./config.js";

export class XmlFileUtil {
    static patchQuotesInXPath(value) {
        const parts = [''];
        let currentPart = [];

        // Iterate over each character in the string
        for (let char of value) {
            if (char === '"' || char === "'") {
                // When encountering a quote, save the current part and the quote separately
                if (currentPart.length > 0) {
                    parts.push(currentPart.join(''));
                    currentPart = [];
                }
                parts.push(char);
            } else {
                // Otherwise, continue adding to the current part
                currentPart.push(char);
            }
        }

        // Add the last part if it exists
        if (currentPart.length > 0) {
            parts.push(currentPart.join(''));
        }

        // Construct the concat() function parts
        const concatParts = parts.map(part => {
            if (part === '"') {
                return "'\"'";
            } else if (part === "'") {
                return '"\'"';
            } else {
                return `'${part}'`;
            }
        });

        return `concat(${concatParts.join(', ')})`;
    }

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
                    code: select1("@code", select1("classification", xmlElement))?.value
                },
                classificationElementTypeGroup: {
                    code: select1("@code", select1("classification-element-type-group", xmlElement))?.value
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

            let configurationCorePropertyMap = getConfigurationCorePropertyMap();
            let configurationCustomPropertyMap = getConfigurationCustomPropertyMap();

            configurationCorePropertyMap.forEach((corePtyMap, corePtyGpName) => {
                element.coreProperties[corePtyGpName.dbKey] = {};
                corePtyMap.forEach(corePtyName => {
                    const corePtyNode = select1(`core-property-groups/group[@name="${corePtyGpName.xmlKey}"]/property[@name="${corePtyName.xmlKey}"]/@value`, xmlElement);
                    element.coreProperties[corePtyGpName.dbKey][corePtyName.dbKey] = corePtyNode == undefined || corePtyNode == null ? null : corePtyNode.value;
                });
            });

            if (element.classificationElementTypeGroup.code?.length > 0) {
                const configurationCustomPropertyGroupKey = this.getKeyByDbKey(configurationCustomPropertyMap, element.classificationElementTypeGroup.code);

                if (configurationCustomPropertyGroupKey != null) {
                    const customPropertyGroupName = configurationCustomPropertyGroupKey.dbKey;
                    element.customProperties[customPropertyGroupName] = {};

                    configurationCustomPropertyMap.get(configurationCustomPropertyGroupKey).forEach(customPtyName => {
                        const customPtyNode = select1(`custom-property-groups/group[@name=${this.patchQuotesInXPath(configurationCustomPropertyGroupKey.xmlKey)}]/property[@name=${this.patchQuotesInXPath(customPtyName.xmlKey)}]/@value`, xmlElement);
                        element.customProperties[customPropertyGroupName][customPtyName.dbKey] = customPtyNode == undefined || customPtyNode == null ? null : customPtyNode.value;
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

    static getKeyByDbKey(map, dbKeyValue) {
        const key = Array.from(map.keys()).find(key => key.dbKey === dbKeyValue.toLowerCase());
        return key;
    };

    static getValueByDbKey(map, dbKeyValue) {
        const key = Array.from(map.keys()).find(key => key.dbKey === dbKeyValue.toLowerCase());
        return key ? map.get(key) : undefined;
    };

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
                classification: { "@code": elementDto.classification.code },
                "classification-element-type-group": { "@code": elementDto.classificationElementTypeGroup.code },
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
import { select, select1 } from "xpath";
import { configurationCorePropertyMap, configurationCustomPropertyMap } from "./config.js";

export const parseSyncXmlData = function (syncXmlDoc) {
    let project = {
        name: null,
        elements: [],
        deletedElements: []
    };

    project.name = select1("/project/@name", syncXmlDoc).value;

    select("/project/elements/element", syncXmlDoc).forEach(xmlElement => {
        let element = {
            guid: select1("@guid", xmlElement).value,
            name: select1("@name", xmlElement).value,
            type: select1("@type", xmlElement).value,
            variation: select1("@variation", xmlElement).value,
            modiStamp: select1("@modiStamp", xmlElement).value,
            classification: {
                code: select1("@code", select1("classification", xmlElement)).value,
                name: select1("@name", select1("classification", xmlElement)).value
            },
            classificationGroup: {
                code: select1("@code", select1("classification-group", xmlElement)).value,
                name: select1("@name", select1("classification-group", xmlElement)).value
            },
            libraryPart: {
                index: select1("@index", select1("library-part", xmlElement)).value,
                documentName: select1("@documentName", select1("library-part", xmlElement)).value,
                uniqueId: select1("@uniqueId", select1("library-part", xmlElement)).value
            },
            coreProperties: new Map(),
            customProperties: new Map()
        };

        configurationCorePropertyMap.forEach((corePtyMap, corePtyGpName) => {
            element.coreProperties.set(corePtyGpName, new Map());
            corePtyMap.forEach(corePtyName => {
                const corePtyNode = select1(`core-property-groups/group[@name="${corePtyGpName}"]/property[@name="${corePtyName}"]/@value`, xmlElement);
                element.coreProperties.get(corePtyGpName).set(corePtyName, corePtyNode == null ? null : corePtyNode.value);
            });
        });


        // Object.keys(configurationCorePropertyMap).forEach(corePtyGpName => {
        //     element.coreProperties[corePtyGpName] = {};

        //     configurationCorePropertyMap[corePtyGpName].forEach(corePtyName => {
        //         const corePtyNode = select1(`core-property-groups/group[@name="${corePtyGpName}"]/property[@name="${corePtyName}"]/@value`, xmlElement);
        //         element.coreProperties[corePtyGpName][corePtyName] = corePtyNode == null ? null : corePtyNode.value;
        //     });
        // });

        if (element.classificationGroup.code != null && element.classificationGroup.name != null) {
            const customPropertyGroupName = `${element.classificationGroup.code} ${element.classificationGroup.name}`;
            element.customProperties.set(customPropertyGroupName, new Map());

            if (configurationCustomPropertyMap.has(customPropertyGroupName)) {
                configurationCustomPropertyMap.get(customPropertyGroupName).forEach(customPtyName => {
                    const customPtyNode = select1(`custom-property-groups/group[@name="${customPropertyGroupName}"]/property[@name="${customPtyName}"]/@value`, xmlElement);
                    element.customProperties.get(customPropertyGroupName).set(customPtyName, customPtyNode == null ? null : customPtyNode.value);
                });
            }
        }

        project.elements.push(element);
    });

    select("/project/deleted-elements/element", syncXmlDoc).forEach(xmlElement => {
        project.deletedElements.push(select1("@guid", xmlElement).value);
    });

    return project;
}

export const composeSyncXmlData = function (syncData) {
    let xmlObj = {
        project: {
            "@name": syncData.name,
            elements: {
                element: []
            },
            "deleted-elements": {
                element: []
            }
        }
    };

    for (const element of syncData.elements) {
        let xmlElement = {
            "@guid": element.guid,
            "@name": element.name,
            "@modiStamp": element.modiStamp,
            "library-part": {
                "@documentName": element.libraryPart.documentName,
                "@index": element.libraryPart.index,
                "@uniqueId": element.libraryPart.uniqueId
            },
            classification: { "@code": element.classification.code, "@name": element.classification.name },
            "classification-group": { "@code": element.classificationGroup.code, "@name": element.classificationGroup.name },
            "core-property-groups": { group: [] },
            "custom-property-groups": { group: [] }
        };

        for (const corePtyGroupName of element.coreProperties.keys()) {
            let propertyGroup = { "@name": corePtyGroupName, property: [] };
            for (const corePtyName of element.coreProperties.get(corePtyGroupName).keys()) {
                propertyGroup.property.push({ "@name": corePtyName, "@value": element.coreProperties.get(corePtyGroupName).get(corePtyName) });
            }

            xmlElement["core-property-groups"].group.push(propertyGroup);
        }

        for (const customPtyGroupName of element.customProperties.keys()) {
            let propertyGroup = { "@name": customPtyGroupName, property: [] };
            for (const customPtyName of element.customProperties.get(customPtyGroupName).keys()) {
                propertyGroup.property.push({ "@name": customPtyName, "@value": element.customProperties.get(customPtyGroupName).get(customPtyName) });
            }

            xmlElement["custom-property-groups"].group.push(propertyGroup);
        }

        xmlObj.project.elements.element.push(xmlElement);
    }

    return xmlObj;
}
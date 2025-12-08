import { type NodeProps } from "@xyflow/react";
//TODO: refactor the createlayercomponent to be modular and seperate change handling and input handling into sections
//TODO: make the createlayercomponent dependant on data such as number of handles
//      (can be done by implementing functions which compute the number of handles by looking at the data and the inputs as well)
//TODO: implement handle naming instead of edge naming or link the 2 on the frontend
//      (unsure if this is needed inside the node or not)
//TODO: during initial instantiation, data is not provided so use the param schema defaults to start
//TODO: work out the base implementation for forward pass
//TODO: add edge functionality (right now we only have node functionality)
//TODO: add functionality on the frontend to change the name of layer by the user. this "layer_name" property should update the node data
//      (this "layer_name" property will be used by forward and init code)
//TODO: when a new node is instantiated, its node data should become populated with default values and default names
//TODO: inside edge functionality we want the edges to describe which handle they originate from and which edge they go towards.
//TODO: the shape compute function may become the property of the handles themselves for more complicated modules. 
export type FieldType = 'number' | 'text' | 'boolean' | 'select' // This describes how user can input a param's value
export interface FieldSpec {
    // This defines all the essential requirements of a parameter that a schema should follow
    type: FieldType;
    required: boolean;
    label?: string;
    options?: string[];
    defaultValue?: any;
    step?: number;
}
export type LayerData = Record<string, any>;

// These are static class level static function implementation
// all attributes and methods MUST be static in nature to the class
export interface LayerDefinition<D extends LayerData> {

    // Class configurations
    label: string;
    paramSchema: Record<string, FieldSpec>;
    // Pure functions
    computeShape(data: D, inputs?: any): number[];
    getInitCode(data: D, name: string): string;
    getForwardCode(name: string, inputs: string[], outputs: string[], data?: D): string;
    // UI component
    // Choose a design choice to make the Component a class reference or an instance reference
    // highly leaning towards making it an instance reference
    // abstract away the component updation process into its own function and keep the default component here
    // the component updation process will be dependant on the specific data while first creation should be component specific
    Component: React.ComponentType<NodeProps<any>>;
}

// This is a base implementation of the init code that can dynamically update
//  depending on if the value has been changed to a non default param value
export function buildInitString(
    className: string,
    name: string,
    schema: Record<string, FieldSpec>,
    data: Record<string, any>
) {
    const args: string[] = [];
    Object.keys(schema).forEach(key => {
        const spec = schema[key];
        const value = data[key];
        const toPython = (val: any) => {
            if (spec.type === 'boolean') return val ? 'True' : 'False';
            if (spec.type === 'select' || spec.type === 'text') return `${val}`
            return val
        };

        if (spec.required) {
            const valToUse = value !== undefined ? value : spec.defaultValue;
            // args.push(toPython(valToUse));
            args.push(`${key}=${toPython(valToUse)}`)
        } else {
            if (value !== undefined && value !== spec.defaultValue) {
                args.push(`${key}=${toPython(value)}`)
            }
        }
    })
    return `self.${name} = ${className}(${args.join(', ')})`
}

// A base implementation of forward pass code is also required here since most layers will behave almost exactly the same way

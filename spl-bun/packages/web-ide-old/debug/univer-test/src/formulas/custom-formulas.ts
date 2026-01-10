import type { ArrayValueObject, BaseValueObject } from "@univerjs/engine-formula";
import { BaseFunction, NumberValueObject, StringValueObject } from "@univerjs/engine-formula";

// Define custom function names
export enum FUNCTION_NAMES_CUSTOM {
  DSL = "DSL",
  DOUBLE = "DOUBLE",
  GREET = "GREET",
  CUSTOMSUM = "CUSTOMSUM",
}

// DSL function - returns the expression text as-is (for displaying DSL queries)
export class DslFunction extends BaseFunction {
  override calculate(expression: BaseValueObject) {
    if (expression.isError()) {
      return expression;
    }

    const text = expression.getValue();
    return StringValueObject.create(String(text));
  }
}

// DOUBLE function - doubles a number
export class DoubleFunction extends BaseFunction {
  override calculate(value: BaseValueObject) {
    if (value.isError()) {
      return value;
    }

    const num = value.getValue();
    if (typeof num === "number") {
      return NumberValueObject.create(num * 2);
    }

    return NumberValueObject.create(0);
  }
}

// GREET function - returns a greeting string
export class GreetFunction extends BaseFunction {
  override calculate(name: BaseValueObject) {
    if (name.isError()) {
      return name;
    }

    const nameStr = name.getValue();
    return StringValueObject.create(`Hello, ${nameStr}!`);
  }
}

// CUSTOMSUM function - sums values with custom logic
export class CustomSumFunction extends BaseFunction {
  override calculate(...variants: BaseValueObject[]) {
    let accumulatorAll: BaseValueObject = NumberValueObject.create(0);

    for (let i = 0; i < variants.length; i++) {
      let variant = variants[i];

      if (variant.isError()) {
        return variant;
      }

      if (accumulatorAll.isError()) {
        return accumulatorAll;
      }

      if (variant.isArray()) {
        variant = (variant as ArrayValueObject).sum();
      }

      accumulatorAll = accumulatorAll.plus(variant as BaseValueObject);
    }

    return accumulatorAll;
  }
}

// Export function mappings for registration
export const customFunctions: Array<[new () => BaseFunction, string]> = [
  [DslFunction, FUNCTION_NAMES_CUSTOM.DSL],
  [DoubleFunction, FUNCTION_NAMES_CUSTOM.DOUBLE],
  [GreetFunction, FUNCTION_NAMES_CUSTOM.GREET],
  [CustomSumFunction, FUNCTION_NAMES_CUSTOM.CUSTOMSUM],
];

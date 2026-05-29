// 没用，留着做参考
// 这是一个简单的组件，接受一个color属性，渲染一个16x16的正方形，背景颜色为color，边框为1px的灰色实线
interface SquareProps {
    color: string;
}

const Square = (props: SquareProps) => {
    return (
        <div style={{
            height: 16,
            width: 16,
            borderWidth: 1,
            borderColor: "gray",
            borderStyle: "solid",
            backgroundColor: props.color
        }} />
    );
};

export default Square;